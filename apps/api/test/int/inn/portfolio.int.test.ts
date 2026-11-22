import {
  INN_ERROR_CODES,
  ipAssetDetailSchema,
  ipAssetListResponseSchema,
  type IpAssetDetail,
} from '@arza/contracts';
import { expect, it } from 'vitest';

import { availableFile } from '../hr/support/people-fixture.js';
import { auditActions, errorCode } from '../iam/support/iam-fixtures.js';
import { AccessScenario, type Person } from '../iam/support/access-scenario.js';
import {
  coded,
  created,
  innFixture,
  later,
  remove,
  software,
  trademark,
} from './support/inn-fixture.js';

// Portafolio de propiedad intelectual (B40, ficha 17.16; RE-INN-001) con su cadena de
// titularidad (decisión 8). Lo administra Calidad; lo leen la Dirección, el Líder técnico y el
// Auditor.

const scenario = new AccessScenario('innovacion portafolio');

async function detail(person: Person, id: string): Promise<IpAssetDetail> {
  const response = await scenario.get(`/v1/innovation/ip-assets/${id}`, person.session);
  if (response.status !== 200) throw new Error(response.text);
  return ipAssetDetailSchema.parse(response.body);
}

it('Calidad registra una marca; la ven quienes leen Innovación y avisa su renovación', async () => {
  const f = await innFixture(scenario, 'marca');
  const body = trademark(scenario, f.quality.id, 150);
  const path = '/v1/innovation/ip-assets';
  expect((await scenario.post(path, f.director.session, body)).status).toBe(403);
  expect((await scenario.post(path, f.worker.session, body)).status).toBe(403);
  const { id, code } = coded(await scenario.post(path, f.quality.session, body));
  expect(code).toMatch(/^PI-\d{4}-\d{4}$/);
  const list = ipAssetListResponseSchema.parse((await scenario.get(path, f.auditor.session)).body);
  expect(list.data.find((asset) => asset.id === id)).toMatchObject({
    office: 'Superintendencia de Industria y Comercio',
    renewal_due: true,
    days_to_expiry: 150,
    status: 'registered',
  });
  expect((await scenario.get(path, f.worker.session)).status).toBe(403);
  const far = coded(
    await scenario.post(path, f.quality.session, trademark(scenario, f.quality.id, 400)),
  );
  expect((await detail(f.tech, far.id)).renewal_due).toBe(false);
  const renewed = { ...body, expires_on: later(scenario, 3800) };
  expect((await scenario.patch(`${path}/${id}`, f.quality.session, renewed, 1)).status).toBe(204);
  expect((await scenario.patch(`${path}/${id}`, f.quality.session, renewed, 1)).status).toBe(409);
  expect((await detail(f.director, id)).renewal_due).toBe(false);
  const noNumber = { ...body, registry_number: null };
  expect((await scenario.post(path, f.quality.session, noNumber)).status).toBe(422);
  const stranger = { ...body, responsible_id: '01900000-0000-7000-8000-00000000dead' };
  expect((await scenario.post(path, f.quality.session, stranger)).status).toBe(422);
});

it('el software no se radica sin la cesión de sus autores (decisión 8)', async () => {
  const f = await innFixture(scenario, 'cadena');
  const body = software(f.quality.id);
  const { id } = coded(await scenario.post('/v1/innovation/ip-assets', f.quality.session, body));
  const path = `/v1/innovation/ip-assets/${id}`;
  const filed = { ...body, status: 'filed', filed_on: later(scenario, 0) };
  const blocked = await scenario.patch(path, f.quality.session, filed, 1);
  expect(blocked.status).toBe(422);
  expect(errorCode(blocked)).toBe(INN_ERROR_CODES.chainIncomplete);
  const direct = await scenario.post('/v1/innovation/ip-assets', f.quality.session, filed);
  expect(errorCode(direct)).toBe(INN_ERROR_CODES.chainIncomplete);
  const authors = `${path}/authors`;
  const noContract = { user_id: f.tech.id, support_kind: 'employment_contract' };
  expect((await scenario.post(authors, f.quality.session, noContract)).status).toBe(422);
  const ghostContract = { name: 'Autor externo', support_kind: 'contract', contract_code: 'CT-0' };
  expect((await scenario.post(authors, f.quality.session, ghostContract)).status).toBe(422);
  const file = await availableFile(scenario, f.quality);
  const cession = { name: 'Autora externa', support_kind: 'document', support_file_id: file };
  expect((await scenario.post(authors, f.tech.session, cession)).status).toBe(403);
  const authorId = created(await scenario.post(authors, f.quality.session, cession));
  expect((await scenario.patch(path, f.quality.session, filed, 1)).status).toBe(204);
  const stored = await detail(f.auditor, id);
  expect(stored).toMatchObject({ status: 'filed', chain_complete: true, authors_count: 1 });
  expect(stored.authors[0]).toMatchObject({ name: 'Autora externa', support_label: 'soporte.pdf' });
  const last = await remove(scenario, `${authors}/${authorId}`, f.quality);
  expect(errorCode(last)).toBe(INN_ERROR_CODES.chainIncomplete);
  const second = { ...cession, name: 'Otro autor' };
  created(await scenario.post(authors, f.quality.session, second));
  expect((await remove(scenario, `${authors}/${authorId}`, f.quality)).status).toBe(204);
  expect((await remove(scenario, `${authors}/${authorId}`, f.quality)).status).toBe(404);
  expect(await auditActions(scenario.db, scenario.tenant.id, id)).toEqual([
    'inn.asset.create:success',
    'inn.author.add:success',
    'inn.asset.update:success',
    'inn.author.add:success',
    'inn.author.remove:success',
  ]);
});

it('descarga el portafolio RE-INN-001 y el certificado del activo', async () => {
  const f = await innFixture(scenario, 'descargas');
  const file = await availableFile(scenario, f.quality);
  const body = { ...trademark(scenario, f.quality.id, 900), certificate_file_id: file };
  const { id, code } = coded(
    await scenario.post('/v1/innovation/ip-assets', f.quality.session, body),
  );
  const csv = await scenario.post('/v1/innovation/ip-assets/export', f.auditor.session);
  expect(csv.status).toBe(200);
  expect(csv.headers['content-type']).toContain('text/csv');
  expect(csv.text).toContain('Clases de Niza');
  expect(csv.text).toContain(code);
  expect((await scenario.post('/v1/innovation/ip-assets/export', f.worker.session)).status).toBe(
    403,
  );
  const link = `/v1/innovation/ip-assets/${id}/certificate/download-link`;
  expect((await scenario.post(link, f.director.session)).status).toBe(200);
  expect((await detail(f.director, id)).certificate).toMatchObject({ id: file });
  const bare = coded(
    await scenario.post('/v1/innovation/ip-assets', f.quality.session, software(f.quality.id)),
  );
  const none = `/v1/innovation/ip-assets/${bare.id}/certificate/download-link`;
  expect((await scenario.post(none, f.director.session)).status).toBe(409);
});

it('otra empresa no ve ni cambia el portafolio', async () => {
  const f = await innFixture(scenario, 'aislamiento');
  const body = trademark(scenario, f.quality.id, 300);
  const { id } = coded(await scenario.post('/v1/innovation/ip-assets', f.quality.session, body));
  const stranger = await scenario.person('portafolio-ajeno', ['CALIDAD'], {
    tenantId: scenario.otherTenant.id,
  });
  const theirs = ipAssetListResponseSchema.parse(
    (await scenario.get('/v1/innovation/ip-assets', stranger.session)).body,
  );
  expect(theirs.data.map((asset) => asset.id)).not.toContain(id);
  expect((await scenario.get(`/v1/innovation/ip-assets/${id}`, stranger.session)).status).toBe(404);
  const patch = await scenario.patch(`/v1/innovation/ip-assets/${id}`, stranger.session, body, 1);
  expect(patch.status).toBe(404);
});

import {
  legalTextListResponseSchema,
  publicLegalTextSchema,
  siteCreatedResponseSchema,
} from '@arza/contracts';
import { expect, it } from 'vitest';

import { tenantScope } from '../iam/support/iam-fixtures.js';
import { LEGAL_BODY, SiteScenario } from './support/site-scenario.js';

// Textos legales versionados del sitio (B41, numeral 20.2): borrador → aprobado → publicado →
// reemplazado; nadie aprueba lo que redactó (decisión 2); el visitante solo ve lo publicado.

const scenario = new SiteScenario('sitio textos legales');

async function staff(tenantId = scenario.tenant.id) {
  const [officer, director, sales, worker] = await Promise.all([
    scenario.person('oficial', ['OFICIAL_DATOS'], { tenantId }),
    scenario.person('direccion', ['DIRECCION'], { tenantId }),
    scenario.person('comercial', ['COMERCIAL'], { tenantId }),
    scenario.person('colaborador', ['COLABORADOR'], { tenantId }),
  ]);
  return { officer, director, sales, worker };
}

it('se redacta, se aprueba por otra persona y se publica; la nueva reemplaza a la anterior', async () => {
  const f = await staff();
  expect((await scenario.publicGet('legal/data_subject_rights')).status).toBe(404);
  const first = await scenario.publishText('data_subject_rights', {
    drafter: f.officer,
    approver: f.director,
  });
  const visible = publicLegalTextSchema.parse(
    (await scenario.publicGet('legal/data_subject_rights')).body,
  );
  expect(visible).toMatchObject({ id: first, version_number: 1, body: LEGAL_BODY });
  const second = await scenario.publishText(
    'data_subject_rights',
    { drafter: f.sales, approver: f.officer },
    'Derechos del titular, segunda versión',
  );
  const latest = publicLegalTextSchema.parse(
    (await scenario.publicGet('legal/data_subject_rights')).body,
  );
  expect(latest).toMatchObject({ id: second, version_number: 2 });
  const list = legalTextListResponseSchema.parse(
    (await scenario.get('/v1/site/legal-texts?key=data_subject_rights', f.sales.session)).body,
  );
  expect(list.data.map((row) => [row.version_number, row.status])).toEqual([
    [2, 'published'],
    [1, 'replaced'],
  ]);
  expect(list.data[0]?.approved_by?.id).toBe(f.officer.id);
});

it('nadie aprueba lo que redactó y lo aprobado ya no se edita', async () => {
  const f = await staff();
  const body = { key: 'security_disclosure', title: 'Seguridad', body: LEGAL_BODY };
  const response = await scenario.post('/v1/site/legal-texts', f.officer.session, body);
  const { id } = siteCreatedResponseSchema.parse(response.body);
  const again = await scenario.post('/v1/site/legal-texts', f.sales.session, body);
  expect(again.status).toBe(409);
  const base = `/v1/site/legal-texts/${id}`;
  const own = await scenario.act(`${base}/actions/approve`, f.officer.session, 1);
  expect(own.status).toBe(403);
  expect(own.body).toMatchObject({ error: { code: 'SITE_SELF_APPROVAL' } });
  expect((await scenario.act(`${base}/actions/publish`, f.director.session, 1)).status).toBe(409);
  expect((await scenario.act(`${base}/actions/approve`, f.director.session, 1)).status).toBe(204);
  const edit = { title: 'Seguridad corregida', body: LEGAL_BODY };
  expect((await scenario.patch(base, f.sales.session, edit, 2)).status).toBe(409);
  const stale = await scenario.act(`${base}/actions/publish`, f.director.session, 1);
  expect(stale.status).toBe(409);
});

it('sin permiso no se ve ni se escribe; Comercial redacta pero no publica', async () => {
  const f = await staff();
  expect((await scenario.get('/v1/site/legal-texts', f.worker.session)).status).toBe(403);
  const body = { key: 'site_terms', title: 'Términos', body: LEGAL_BODY };
  expect((await scenario.post('/v1/site/legal-texts', f.worker.session, body)).status).toBe(403);
  const created = await scenario.post('/v1/site/legal-texts', f.sales.session, body);
  const { id } = siteCreatedResponseSchema.parse(created.body);
  const approve = `/v1/site/legal-texts/${id}/actions/approve`;
  expect((await scenario.act(approve, f.sales.session, 1)).status).toBe(403);
});

it('cada empresa ve solo sus textos y el sitio muestra solo los de su empresa', async () => {
  const other = await staff(scenario.otherTenant.id);
  await scenario.publishText('third_party_notices', {
    drafter: other.officer,
    approver: other.director,
  });
  const mine = await staff();
  const list = legalTextListResponseSchema.parse(
    (await scenario.get('/v1/site/legal-texts?key=third_party_notices', mine.sales.session)).body,
  );
  expect(list.data).toHaveLength(0);
  expect((await scenario.publicGet('legal/third_party_notices')).status).toBe(404);
  expect((await scenario.publicGet('legal/no-existe')).status).toBe(404);
});

it('cada paso deja su evento de auditoría', async () => {
  const f = await staff();
  const id = await scenario.publishText('cookie_policy', {
    drafter: f.officer,
    approver: f.director,
  });
  const actions = await tenantScope(
    scenario.db,
    scenario.tenant.id,
  )((tx) => tx.auditEvent.findMany({ where: { entityId: id }, orderBy: { seq: 'asc' } }));
  expect(actions.map((event) => [event.action, event.actorId])).toEqual([
    ['web.legal_text.create', f.officer.id],
    ['web.legal_text.approve', f.director.id],
    ['web.legal_text.publish', f.director.id],
  ]);
});

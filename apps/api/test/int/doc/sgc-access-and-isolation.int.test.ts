import { changeRequestListResponseSchema } from '@arza/contracts';
import { beforeAll, describe, expect, it } from 'vitest';

import { errorCode } from '../iam/support/iam-fixtures.js';
import { SgcScenario } from './support/sgc-scenario.js';

// Permiso denegado y aislamiento entre empresas del control documental (B19, capítulo 21):
// solicitudes, Listado Maestro y constancia de lectura.

const scenario = new SgcScenario('control documental acceso');

beforeAll(async () => {
  await scenario.seed();
});

async function publishedDocument() {
  const author = await scenario.quality('elabora');
  const id = await scenario.createDocument(author);
  await scenario.publishLatest(author, await scenario.quality('aprueba'), id);
  return { author, id };
}

describe('permiso denegado', () => {
  it('sin rol o desde el portal no hay solicitudes, Listado Maestro ni constancias', async () => {
    const { author, id } = await publishedDocument();
    const requestId = await scenario.fileRequest(author);
    const people = [
      await scenario.person('sin-rol', []),
      await scenario.person('portal', ['CLIENTE_ADMIN'], { kind: 'portal' }),
    ];
    for (const person of people) {
      const denied = [
        await scenario.get('/v1/change-requests', person.session),
        await scenario.get(`/v1/change-requests/${requestId}`, person.session),
        await scenario.post('/v1/change-requests', person.session, {}),
        await scenario.post(`/v1/change-requests/${requestId}/actions/analyze`, person.session),
        await scenario.get('/v1/master-list', person.session),
        await scenario.post('/v1/master-list/export', person.session),
        await scenario.get(`/v1/documents/${id}/acknowledgements`, person.session),
        await scenario.post(`/v1/documents/${id}/acknowledgements/mine`, person.session),
        await scenario.post(`/v1/documents/${id}/acknowledgement-requests`, person.session),
      ];
      for (const response of denied) expect(errorCode(response)).toBe('PERMISSION_DENIED');
    }
  });
});

describe('permiso denegado: quién decide y quién ve', () => {
  it('Comercial radica solicitudes pero no las decide ni pide lecturas', async () => {
    const { id } = await publishedDocument();
    const commercial = await scenario.person('comercial', ['COMERCIAL']);
    const requestId = await scenario.fileRequest(commercial);
    const analyze = await scenario.post(
      `/v1/change-requests/${requestId}/actions/analyze`,
      commercial.session,
    );
    expect(errorCode(analyze)).toBe('PERMISSION_DENIED');
    const again = await scenario.post(
      `/v1/documents/${id}/acknowledgement-requests`,
      commercial.session,
    );
    expect(errorCode(again)).toBe('PERMISSION_DENIED');
  });

  it('el Colaborador ve solo las solicitudes que él pidió', async () => {
    const { id } = await publishedDocument();
    await scenario.fileRequest(await scenario.quality('otra'));
    const collaborator = await scenario.person('colaborador', ['COLABORADOR']);
    await scenario.placeInProcess(collaborator.id, 'SGC');
    const own = await scenario.fileRequest(collaborator, {
      action: 'update',
      document_id: id,
      doc_type: null,
      process_id: null,
      title: null,
    });
    const list = await scenario.get('/v1/change-requests', collaborator.session);
    const ids = changeRequestListResponseSchema.parse(list.body).data.map((row) => row.id);
    expect(ids).toEqual([own]);
  });
});

describe('aislamiento entre empresas', () => {
  it('la empresa B no ve ni decide las solicitudes de la empresa A', async () => {
    const requester = await scenario.quality('pide');
    const requestId = await scenario.fileRequest(requester);
    const outsider = await scenario.quality('calidad-b', scenario.otherTenant.id);
    const list = await scenario.get('/v1/change-requests', outsider.session);
    expect(changeRequestListResponseSchema.parse(list.body).data.map((r) => r.id)).not.toContain(
      requestId,
    );
    expect(
      errorCode(await scenario.get(`/v1/change-requests/${requestId}`, outsider.session)),
    ).toBe('DOC_CHANGE_REQUEST_NOT_FOUND');
    const step = await scenario
      .post(`/v1/change-requests/${requestId}/actions/analyze`, outsider.session, {})
      .set('If-Match', '"1"');
    expect(errorCode(step)).toBe('DOC_CHANGE_REQUEST_NOT_FOUND');
  });
});

describe('aislamiento entre empresas: Listado Maestro y lectura', () => {
  it('el Listado Maestro y la constancia de lectura de A no se ven desde B', async () => {
    const { id } = await publishedDocument();
    const outsider = await scenario.quality('calidad-b', scenario.otherTenant.id);
    const entries = await scenario.masterList(outsider);
    expect(entries.map((entry) => entry.document_id)).not.toContain(id);
    const report = await scenario.get(`/v1/documents/${id}/acknowledgements`, outsider.session);
    expect(errorCode(report)).toBe('DOC_DOCUMENT_NOT_FOUND');
    const confirm = await scenario.post(
      `/v1/documents/${id}/acknowledgements/mine`,
      outsider.session,
    );
    expect(errorCode(confirm)).toBe('DOC_DOCUMENT_NOT_FOUND');
  });
});

describe('aislamiento entre empresas: consecutivos', () => {
  it('cada empresa lleva su propio consecutivo de solicitudes', async () => {
    const inA = await scenario.changeRequest(
      await scenario.quality('pide-a'),
      await scenario.fileRequest(await scenario.quality('pide-a')),
    );
    const personB = await scenario.quality('pide-b', scenario.otherTenant.id);
    const inB = await scenario.changeRequest(
      personB,
      await scenario.fileRequest(personB, {
        process_id: await scenario.processId('SGC', scenario.otherTenant.id),
      }),
    );
    expect(inB.code).toMatch(/^SAD-\d{4}-0001$/u);
    expect(Number(inA.code.slice(-4))).toBeGreaterThan(1);
  });
});

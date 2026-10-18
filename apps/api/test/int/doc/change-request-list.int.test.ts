import { changeRequestListResponseSchema, type ChangeRequestListResponse } from '@arza/contracts';
import { beforeAll, describe, expect, it } from 'vitest';

import type { Person } from '../iam/support/access-scenario.js';
import { errorCode } from '../iam/support/iam-fixtures.js';
import { SgcScenario } from './support/sgc-scenario.js';

// Bandeja de Solicitudes de Acción Documental (B19): filtros por estado, documento y acción que se
// puede usar, páginas con cursor, el proceso que exige cada tipo y la versión elaborada antes de
// B19, que recibe su trámite al enviarse.

const scenario = new SgcScenario('bandeja de solicitudes');

beforeAll(async () => {
  await scenario.seed();
});

async function list(person: Person, query: string): Promise<ChangeRequestListResponse> {
  const response = await scenario.get(`/v1/change-requests?${query}`, person.session);
  expect(response.status, response.text).toBe(200);
  return changeRequestListResponseSchema.parse(response.body);
}

async function ids(person: Person, query: string): Promise<string[]> {
  return (await list(person, query)).data.map((row) => row.id);
}

describe('filtros de la bandeja', () => {
  it('por estado muestra solo las de ese estado', async () => {
    const requester = await scenario.quality('pide');
    const filed = await scenario.fileRequest(requester);
    const approved = await scenario.approvedByFlow(requester);
    const onlyFiled = await ids(requester, 'status=filed');
    expect(onlyFiled).toContain(filed);
    expect(onlyFiled).not.toContain(approved);
    expect(await ids(requester, 'status=approved')).toContain(approved);
  });

  it('por documento y para modificar, solo las aprobadas sin usar de ese documento', async () => {
    const author = await scenario.quality('elabora');
    const id = await scenario.createDocument(author);
    await scenario.publishLatest(author, await scenario.quality('aprueba'), id);
    const update = await scenario.approvedRequest(author, { action: 'update', documentId: id });
    const create = await scenario.approvedByFlow(author);
    expect(await ids(author, `document_id=${id}`)).toEqual([update]);
    const usable = await ids(author, 'usable=update');
    expect(usable).toContain(update);
    expect(usable).not.toContain(create);
  });
});

describe('páginas de la bandeja', () => {
  it('el cursor trae la página siguiente sin repetir ni saltar solicitudes', async () => {
    const requester = await scenario.quality('pagina');
    const filed = [
      await scenario.fileRequest(requester),
      await scenario.fileRequest(requester),
      await scenario.fileRequest(requester),
    ];
    const first = await list(requester, 'status=filed&limit=2');
    expect(first.data).toHaveLength(2);
    expect(first.next_cursor).not.toBeNull();
    const second = await list(requester, `status=filed&limit=2&cursor=${first.next_cursor ?? ''}`);
    const seen = [...first.data, ...second.data].map((row) => row.id);
    expect(new Set(seen).size).toBe(seen.length);
    for (const id of filed) expect(seen).toContain(id);
  });
});

describe('proceso del documento que se pide crear', () => {
  it('un procedimiento exige su proceso y el Reglamento Interno no lleva ninguno', async () => {
    const requester = await scenario.quality('pide');
    const body = {
      action: 'create',
      document_id: null,
      title: 'Documento pedido',
      justification: 'El proceso necesita este documento nuevo.',
    };
    const withoutProcess = await scenario.post('/v1/change-requests', requester.session, {
      ...body,
      doc_type: 'PR',
      process_id: null,
    });
    expect(errorCode(withoutProcess)).toBe('DOC_REFERENCE_INVALID');
    const withProcess = await scenario.post('/v1/change-requests', requester.session, {
      ...body,
      doc_type: 'RIT',
      process_id: await scenario.processId('SGC'),
    });
    expect(errorCode(withProcess)).toBe('DOC_REFERENCE_INVALID');
  });
});

describe('versión elaborada antes de B19', () => {
  it('sin trámite, lo recibe al enviarse a revisión', async () => {
    const author = await scenario.quality('elabora');
    const id = await scenario.createDocument(author);
    const draft = await scenario.latest(author, id);
    await scenario.inTenant((tx) =>
      tx.docVersion.update({ where: { id: draft.id }, data: { workflowInstanceId: null } }),
    );
    const legacy = await scenario.latest(author, id);
    expect(legacy.workflow_instance_id).toBeNull();
    const sent = await scenario.step(author, legacy, 'submit');
    expect(sent.status, sent.text).toBe(204);
    const submitted = await scenario.latest(author, id);
    expect(submitted.status).toBe('in_review');
    expect(submitted.workflow_instance_id).not.toBeNull();
    expect(submitted.workflow_instance_id).not.toBe(draft.workflow_instance_id);
  });
});

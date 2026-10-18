import { changeRequestListResponseSchema } from '@arza/contracts';
import { beforeAll, describe, expect, it } from 'vitest';

import { errorCode } from '../iam/support/iam-fixtures.js';
import { SgcScenario } from './support/sgc-scenario.js';

// Un cambio en un documento del SGC exige una Solicitud de Acción Documental aprobada que pida
// exactamente ese cambio (B19, ficha 17.4): no sirve una de otro tipo, una sin aprobar ni una usada.

const scenario = new SgcScenario('reglas de las solicitudes');

beforeAll(async () => {
  await scenario.seed();
});

describe('documento nuevo del SGC', () => {
  it('sin solicitud no se crea', async () => {
    const author = await scenario.quality('elabora');
    const body = await scenario.documentBody(author, { change_request_id: null });
    expect(errorCode(await scenario.post('/v1/documents', author.session, body))).toBe(
      'VALIDATION_FAILED',
    );
  });

  it('con una solicitud de otro tipo, sin aprobar o ya usada, tampoco', async () => {
    const author = await scenario.quality('elabora');
    const plan = await scenario.approvedRequest(author, {
      action: 'create',
      docType: 'PL',
      processId: await scenario.processId('SGC'),
    });
    const other = await scenario.documentBody(author, { change_request_id: plan });
    expect(errorCode(await scenario.post('/v1/documents', author.session, other))).toBe(
      'DOC_CHANGE_REQUEST_INVALID',
    );
    const filed = await scenario.fileRequest(author);
    const pending = await scenario.documentBody(author, { change_request_id: filed });
    expect(errorCode(await scenario.post('/v1/documents', author.session, pending))).toBe(
      'DOC_CHANGE_REQUEST_INVALID',
    );
    const approved = await scenario.approvedByFlow(author);
    await scenario.createDocument(author, { change_request_id: approved });
    const reused = await scenario.documentBody(author, { change_request_id: approved });
    expect(errorCode(await scenario.post('/v1/documents', author.session, reused))).toBe(
      'DOC_CHANGE_REQUEST_INVALID',
    );
  });
});

describe('documento nuevo fuera del SGC', () => {
  it('un documento de expediente no necesita solicitud', async () => {
    const author = await scenario.quality('elabora');
    const id = await scenario.createDocument(author, {
      folder_id: await scenario.folderId('EXP'),
      is_controlled: false,
      process_id: null,
    });
    expect((await scenario.document(author, id)).code).toMatch(/^DOC-/u);
  });
});

describe('versión nueva de un documento vigente', () => {
  it('sin solicitud de modificación aprobada no se crea', async () => {
    const author = await scenario.quality('elabora');
    const id = await scenario.createDocument(author);
    await scenario.publishLatest(author, await scenario.quality('aprueba'), id);
    const body = {
      title: 'Control de documentos',
      classification: 'internal',
      owner_position_id: null,
      source_file_id: await scenario.sourceFile(author),
      change_summary: 'Ajuste del alcance',
    };
    const without = await scenario.post(`/v1/documents/${id}/versions`, author.session, body);
    expect(errorCode(without)).toBe('DOC_CHANGE_REQUEST_REQUIRED');
    const otherDocument = await scenario.createDocument(author);
    const wrong = await scenario.approvedRequest(author, {
      action: 'update',
      documentId: otherDocument,
    });
    const mismatch = await scenario.post(`/v1/documents/${id}/versions`, author.session, {
      ...body,
      change_request_id: wrong,
    });
    expect(errorCode(mismatch)).toBe('DOC_CHANGE_REQUEST_INVALID');
  });

  it('las solicitudes aprobadas sin usar se ofrecen para la acción que piden', async () => {
    const author = await scenario.quality('elabora');
    const unused = await scenario.approvedByFlow(author);
    const response = await scenario.get('/v1/change-requests?usable=create', author.session);
    expect(response.status).toBe(200);
    const ids = changeRequestListResponseSchema.parse(response.body).data.map((row) => row.id);
    expect(ids).toContain(unused);
    await scenario.createDocument(author, { change_request_id: unused });
    const after = await scenario.get('/v1/change-requests?usable=create', author.session);
    const remaining = changeRequestListResponseSchema.parse(after.body).data.map((r) => r.id);
    expect(remaining).not.toContain(unused);
  });
});

describe('Reglamento Interno de Trabajo (RIT-001)', () => {
  it('es un documento del SGC sin proceso, con su propio consecutivo', async () => {
    const author = await scenario.quality('elabora');
    const requestId = await scenario.approvedByFlow(author, {
      doc_type: 'RIT',
      process_id: null,
      title: 'Reglamento Interno de Trabajo',
    });
    const id = await scenario.createDocument(author, {
      doc_type: 'RIT',
      process_id: null,
      folder_id: await scenario.folderId('SGC'),
      change_request_id: requestId,
    });
    expect((await scenario.document(author, id)).code).toMatch(/^RIT-\d{3}$/u);
  });
});

import { beforeAll, describe, expect, it } from 'vitest';

import { errorCode } from '../iam/support/iam-fixtures.js';
import { SgcScenario } from './support/sgc-scenario.js';

// Solicitud de Acción Documental (B19, FT-SGC-001 y ficha 17.4): radicada → en análisis →
// aprobada o rechazada → ejecutada, con su trámite en el motor de flujos. Quien la pide no la decide.

const scenario = new SgcScenario('solicitudes documentales');

beforeAll(async () => {
  await scenario.seed();
});

describe('radicar una solicitud', () => {
  it('recibe el código SAD-AAAA-NNNN y su trámite deja la tarea de análisis a Calidad', async () => {
    const requester = await scenario.person('comercial', ['COMERCIAL']);
    const id = await scenario.fileRequest(requester);
    const seen = await scenario.changeRequest(requester, id);
    expect(seen.code).toMatch(/^SAD-\d{4}-\d{4}$/u);
    expect(seen.status).toBe('filed');
    expect(seen.step).toBe('Radicada');
    expect(seen.requested_by?.id).toBe(requester.id);
    expect(seen.workflow_instance_id).not.toBeNull();
    expect(seen.actions).toEqual([]);
    const quality = await scenario.quality('analiza');
    expect((await scenario.changeRequest(quality, id)).actions).toEqual(['analyze']);
    expect(await scenario.auditActions(id)).toContain('doc.change_request.create');
  });

  it('modificar exige un documento vigente del SGC, y solo una solicitud abierta por documento', async () => {
    const author = await scenario.quality('elabora');
    const draft = await scenario.createDocument(author);
    const update = { action: 'update', document_id: draft, doc_type: null, process_id: null };
    const notCurrent = await scenario.post('/v1/change-requests', author.session, {
      ...update,
      title: null,
      justification: 'Ajustar el alcance del procedimiento.',
    });
    expect(errorCode(notCurrent)).toBe('DOC_REFERENCE_INVALID');
    await scenario.publishLatest(author, await scenario.quality('aprueba'), draft);
    await scenario.fileRequest(author, { ...update, title: null });
    const second = await scenario.post('/v1/change-requests', author.session, {
      ...update,
      title: null,
      justification: 'Otra solicitud para el mismo documento.',
    });
    expect(second.status).toBe(409);
    expect(errorCode(second)).toBe('DOC_CHANGE_REQUEST_INVALID');
  });
});

describe('quien pide el cambio no lo decide (ficha 17.4)', () => {
  it('Calidad analiza; quien la pidió no la aprueba, otra persona de Calidad sí', async () => {
    const requester = await scenario.quality('pide');
    const id = await scenario.fileRequest(requester);
    expect((await scenario.requestStep(requester, id, 'analyze')).status).toBe(204);
    expect((await scenario.changeRequest(requester, id)).status).toBe('in_analysis');
    expect((await scenario.changeRequest(requester, id)).actions).toEqual([]);
    const own = await scenario.requestStep(requester, id, 'approve');
    expect(errorCode(own)).toBe('DOC_SELF_DECISION');
    expect((await scenario.changeRequest(requester, id)).status).toBe('in_analysis');
    const decider = await scenario.quality('decide');
    expect((await scenario.requestStep(decider, id, 'approve')).status).toBe(204);
    const decided = await scenario.changeRequest(requester, id);
    expect(decided.status).toBe('approved');
    expect(decided.decided_by?.id).toBe(decider.id);
    expect(decided.step).toBeNull();
  });

  it('la base de datos tampoco deja que quien pidió la solicitud la decida', async () => {
    const requester = await scenario.quality('pide');
    const id = await scenario.fileRequest(requester);
    await scenario.requestStep(requester, id, 'analyze');
    const forced = scenario.inTenant((tx) =>
      tx.docChangeRequest.update({
        where: { id },
        data: { status: 'approved', decidedBy: requester.id, decidedAt: scenario.clock.now() },
      }),
    );
    await expect(forced).rejects.toThrow(/doc_change_requests_decider_check/u);
  });

  it('al decidirse, quien la pidió recibe el aviso', async () => {
    const requester = await scenario.quality('pide');
    const id = await scenario.approvedByFlow(requester);
    const events = await scenario.outbox('doc.request.decided');
    const mine = events.find((event) => JSON.stringify(event.payload).includes(id));
    expect(mine?.payload).toMatchObject({ requester_id: requester.id, outcome: 'approved' });
  });
});

describe('rechazar una solicitud', () => {
  it('exige el comentario y lo deja como motivo', async () => {
    const requester = await scenario.person('comercial', ['COMERCIAL']);
    const id = await scenario.fileRequest(requester);
    const decider = await scenario.quality('decide');
    await scenario.requestStep(decider, id, 'analyze');
    const silent = await scenario.requestStep(decider, id, 'reject');
    expect(silent.status).toBeGreaterThanOrEqual(400);
    const note = 'Ya existe un procedimiento que cubre esto.';
    expect((await scenario.requestStep(decider, id, 'reject', note)).status).toBe(204);
    const rejected = await scenario.changeRequest(requester, id);
    expect(rejected.status).toBe('rejected');
    expect(rejected.decision_note).toBe(note);
  });
});

describe('ejecutar la solicitud', () => {
  it('el documento nace de la solicitud aprobada y publicarlo la deja ejecutada', async () => {
    const author = await scenario.quality('elabora');
    const requestId = await scenario.approvedByFlow(author);
    const id = await scenario.createDocument(author, { change_request_id: requestId });
    const linked = await scenario.changeRequest(author, requestId);
    expect(linked.document?.id).toBe(id);
    expect(linked.status).toBe('approved');
    await scenario.publishLatest(author, await scenario.quality('aprueba'), id);
    const executed = await scenario.changeRequest(author, requestId);
    expect(executed.status).toBe('executed');
    expect(executed.executed_at).not.toBeNull();
    const [version] = await scenario.versions(author, id);
    expect(version?.change_request?.id).toBe(requestId);
  });

  it('declarar obsoleto un documento del SGC exige su solicitud de eliminación', async () => {
    const author = await scenario.quality('elabora');
    const approver = await scenario.quality('aprueba');
    const id = await scenario.createDocument(author);
    const current = await scenario.publishLatest(author, approver, id);
    const reason = { reason: 'El proceso ya no lo usa' };
    const without = await scenario.step(approver, current, 'obsolete', reason);
    expect(errorCode(without)).toBe('DOC_CHANGE_REQUEST_REQUIRED');
    const requestId = await scenario.approvedRequest(author, {
      action: 'obsolete',
      documentId: id,
    });
    const body = { ...reason, change_request_id: requestId };
    const done = await scenario.step(approver, current, 'obsolete', body);
    expect(done.status, done.text).toBe(204);
    expect((await scenario.document(approver, id)).status).toBe('obsolete');
    expect((await scenario.changeRequest(approver, requestId)).status).toBe('executed');
  });
});

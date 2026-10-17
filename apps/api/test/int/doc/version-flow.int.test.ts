import { beforeAll, describe, expect, it } from 'vitest';

import { errorCode } from '../iam/support/iam-fixtures.js';
import { SgcScenario } from './support/sgc-scenario.js';

// Trámite de la versión en el motor de flujos (B19, ADR-023): Calidad revisa, Dirección aprueba y
// Calidad publica. Un paso dado desde «Mis tareas» cambia la versión en la misma operación, y quien
// elabora no aprueba ni desde allí.

const scenario = new SgcScenario('trámite de versiones');

beforeAll(async () => {
  await scenario.seed();
});

async function submitted() {
  const author = await scenario.quality('elabora');
  const id = await scenario.createDocument(author);
  const sent = await scenario.step(author, await scenario.latest(author, id), 'submit');
  expect(sent.status, sent.text).toBe(204);
  const version = await scenario.latest(author, id);
  return { author, id, instanceId: version.workflow_instance_id ?? '' };
}

describe('el trámite nace con la versión', () => {
  it('el borrador ya tiene su trámite en «Elaboración»', async () => {
    const author = await scenario.quality('elabora');
    const id = await scenario.createDocument(author);
    const draft = await scenario.latest(author, id);
    expect(draft.workflow_instance_id).not.toBeNull();
    expect(draft.step).toBe('Elaboración');
    expect(draft.origin).toBe('platform');
  });
});

describe('pasos desde «Mis tareas»', () => {
  it('revisar y aprobar en la bandeja mueven la versión en la misma operación', async () => {
    const { author, id, instanceId } = await submitted();
    const reviewer = await scenario.quality('revisa');
    const review = await scenario.approveTask(reviewer, await scenario.openTask(instanceId));
    expect(review.status, review.text).toBe(204);
    const reviewed = await scenario.latest(author, id);
    expect(reviewed.status).toBe('in_review');
    expect(reviewed.step).toBe('Aprobación de Dirección');
    const director = await scenario.director();
    const approval = await scenario.approveTask(director, await scenario.openTask(instanceId));
    expect(approval.status, approval.text).toBe(204);
    const approved = await scenario.latest(author, id);
    expect(approved.status).toBe('approved');
    expect(approved.approved_by?.id).toBe(director.id);
    expect(approved.step).toBe('Publicación');
    expect((await scenario.latest(reviewer, id)).actions).toEqual(['publish']);
  });

  it('quien elabora no aprueba su versión ni desde la bandeja (criterio del bloque)', async () => {
    const { author, id, instanceId } = await submitted();
    const taskId = await scenario.openTask(instanceId);
    const own = await scenario.approveTask(author, taskId);
    expect(errorCode(own)).toBe('DOC_SELF_APPROVAL');
    expect((await scenario.latest(author, id)).status).toBe('in_review');
    expect(await scenario.openTask(instanceId)).toBe(taskId);
  });

  it('solo decide quien tiene la tarea del paso: Dirección no revisa por Calidad', async () => {
    const { id } = await submitted();
    const director = await scenario.director();
    const inReview = await scenario.latest(director, id);
    expect(inReview.actions).toEqual([]);
    expect(errorCode(await scenario.step(director, inReview, 'approve'))).toBe(
      'DOC_TRANSITION_NOT_ALLOWED',
    );
  });
});

describe('publicar avisa y pide la constancia de lectura (criterio del bloque)', () => {
  it('cada persona de los cargos destinatarios queda pendiente y recibe el aviso', async () => {
    const author = await scenario.quality('elabora');
    const approver = await scenario.quality('aprueba');
    const readers = [
      await scenario.person('lector-uno', ['COLABORADOR']),
      await scenario.person('lector-dos', ['COLABORADOR']),
    ];
    const id = await scenario.createDocument(author);
    await scenario.target(author, id, await scenario.positionWith(readers));
    const current = await scenario.publishLatest(author, approver, id);
    const report = await scenario.readingReport(approver, id);
    expect(report.version?.id).toBe(current.id);
    expect(report.totals).toEqual({ requested: 2, acknowledged: 0 });
    const people = report.positions.flatMap((section) => section.readers.map((r) => r.user.id));
    expect(people.sort()).toEqual(readers.map((reader) => reader.id).sort());
    const { code } = await scenario.document(author, id);
    const events = await scenario.outbox('doc.acknowledgement.requested');
    const notice = events.find((event) => JSON.stringify(event.payload).includes(id));
    expect(notice?.payload).toMatchObject({ code, version_label: '00' });
    const notified = JSON.stringify(notice?.payload);
    for (const reader of readers) expect(notified).toContain(reader.id);
  });
});

describe('confirmar la lectura', () => {
  it('la persona confirma su lectura una vez; el informe por cargo solo lo ve quien ve todo', async () => {
    const author = await scenario.quality('elabora');
    const reader = await scenario.person('lector', ['COLABORADOR']);
    const id = await scenario.createDocument(author);
    await scenario.target(author, id, await scenario.positionWith([reader]));
    await scenario.publishLatest(author, await scenario.quality('aprueba'), id);
    const before = await scenario.readingReport(reader, id);
    expect(before.can_acknowledge).toBe(true);
    expect(before.positions).toEqual([]);
    const path = `/v1/documents/${id}/acknowledgements/mine`;
    expect((await scenario.post(path, reader.session)).status).toBe(204);
    expect((await scenario.post(path, reader.session)).status).toBe(204);
    const after = await scenario.readingReport(reader, id);
    expect(after.can_acknowledge).toBe(false);
    expect(after.mine?.acknowledged_at).not.toBeNull();
    expect((await scenario.readingReport(author, id)).totals).toEqual({
      requested: 1,
      acknowledged: 1,
    });
    const confirmations = (await scenario.auditActions(after.version?.id ?? '')).length;
    expect(confirmations).toBeGreaterThan(0);
  });

  it('solo se confirma la lectura de un documento vigente', async () => {
    const author = await scenario.quality('elabora');
    const id = await scenario.createDocument(author);
    const response = await scenario.post(
      `/v1/documents/${id}/acknowledgements/mine`,
      author.session,
    );
    expect(errorCode(response)).toBe('DOC_NOT_ACKNOWLEDGEABLE');
  });
});

describe('volver a pedir la lectura', () => {
  it('Calidad vuelve a pedir la lectura a quienes aún no confirman', async () => {
    const author = await scenario.quality('elabora');
    const approver = await scenario.quality('aprueba');
    const readers = [
      await scenario.person('lector-uno', ['COLABORADOR']),
      await scenario.person('lector-dos', ['COLABORADOR']),
    ];
    const id = await scenario.createDocument(author);
    await scenario.target(author, id, await scenario.positionWith(readers));
    await scenario.publishLatest(author, approver, id);
    const first = readers[0];
    if (first === undefined) throw new Error('Sin lectores.');
    await scenario.post(`/v1/documents/${id}/acknowledgements/mine`, first.session);
    const again = await scenario.post(
      `/v1/documents/${id}/acknowledgement-requests`,
      approver.session,
    );
    expect(again.status, again.text).toBe(200);
    expect(again.body).toEqual({ requested: 1 });
  });
});

describe('una versión nueva vuelve a pedir la lectura', () => {
  it('publicar la 01 deja obsoleta la 00 y pide la lectura de la 01', async () => {
    const author = await scenario.quality('elabora');
    const approver = await scenario.quality('aprueba');
    const reader = await scenario.person('lector', ['COLABORADOR']);
    const id = await scenario.createDocument(author);
    await scenario.target(author, id, await scenario.positionWith([reader]));
    await scenario.publishLatest(author, approver, id);
    await scenario.post(`/v1/documents/${id}/acknowledgements/mine`, reader.session);
    await scenario.newVersion(author, id);
    const second = await scenario.publishLatest(author, approver, id);
    const versions = await scenario.versions(approver, id);
    expect(versions.map((v) => [v.label, v.status])).toEqual([
      ['01', 'current'],
      ['00', 'obsolete'],
    ]);
    const report = await scenario.readingReport(reader, id);
    expect(report.version?.id).toBe(second.id);
    expect(report.can_acknowledge).toBe(true);
  });
});

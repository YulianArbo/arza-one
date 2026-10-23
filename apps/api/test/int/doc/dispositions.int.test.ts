import { downloadLinkResponseSchema } from '@arza/contracts';
import { beforeAll, describe, expect, it } from 'vitest';

import { errorCode } from '../iam/support/iam-fixtures.js';
import type { Person } from '../iam/support/access-scenario.js';
import { storage } from './support/file-scenario.js';
import { RetentionScenario } from './support/retention-scenario.js';

// Criterio de B21: nada se elimina sin regla de retención vencida y aprobación (ficha 17.4). La
// propuesta mensual, la revisión de Calidad, la aprobación de Dirección, la ejecución con el acta,
// y la base de datos que también lo impide.

const scenario = new RetentionScenario('disposición final');
const ownScenario = new RetentionScenario('disposición quien envía');
const rejectScenario = new RetentionScenario('disposición rechazada');
const changeScenario = new RetentionScenario('disposición regla cambiada');
let quality: Person;
let approver: Person;
let director: Person;

beforeAll(async () => {
  await scenario.seed();
  quality = await scenario.quality('calidad-disposicion');
  approver = await scenario.quality('aprueba-disposicion');
  director = await scenario.director();
  await scenario.rule(quality, { doc_type: 'PR', active_years: 1, archive_years: 2 });
});

/** Archivos de las versiones del documento, con su llave en el almacenamiento. */
async function filesOf(documentId: string) {
  return scenario.inTenant(async (tx) => {
    const versions = await tx.docVersion.findMany({ where: { documentId } });
    const ids = versions.flatMap((v) =>
      [v.sourceFileId, v.pdfFileId, v.copyFileId].filter((id) => id !== null),
    );
    return tx.file.findMany({ where: { id: { in: ids } } });
  });
}

/** Vigente desde hace diez años: un documento del SGC vigente nunca vence. */
async function currentDocument(): Promise<string> {
  const id = await scenario.createDocument(quality);
  await scenario.publishLatest(quality, approver, id);
  await scenario.age(id, 10);
  return id;
}

/** Obsoleto hace diez años, pero su regla dice conservación total. */
async function keptDocument(): Promise<string> {
  const id = await scenario.obsoleteDocument(quality, approver, { doc_type: 'MN' });
  await scenario.rule(quality, { doc_type: 'MN', disposition: 'keep' });
  await scenario.age(id, 10);
  return id;
}

describe('la propuesta del mes', () => {
  it('solo propone lo que venció con una regla que dice eliminar, una vez por mes', async () => {
    // Los cinco documentos no dependen entre sí: se preparan a la vez para no pasar el tiempo
    // límite en un servidor de integración cargado.
    const [expired, second, fresh, current, kept] = await Promise.all([
      scenario.expiredDocument(quality, approver),
      scenario.expiredDocument(quality, approver),
      scenario.obsoleteDocument(quality, approver),
      currentDocument(),
      keptDocument(),
    ]);
    const first = await scenario.propose(quality);
    expect(first.created).toBe(true);
    const proposal = await scenario.disposition(quality, first.proposal_id ?? '');
    const proposed = proposal.items.map((item) => item.document.id);
    expect(proposed).toEqual(expect.arrayContaining([expired, second]));
    expect(proposed).not.toContain(fresh);
    expect(proposed).not.toContain(current);
    expect(proposed).not.toContain(kept);
    expect(proposal).toMatchObject({ status: 'review', step: 'Revisión de Calidad' });
    expect(proposal.code).toMatch(/^DIS-\d{4}-\d{4}$/u);
    const again = await scenario.propose(quality);
    expect(again).toEqual({ proposal_id: first.proposal_id, created: false });
    expect(await scenario.auditActions(proposal.id)).toEqual(['doc.disposition.propose']);
  });
});

/** Calidad intenta conservar sin motivo, conserva uno con su motivo y envía la propuesta. */
async function reviewAndSend(proposalId: string): Promise<{ destroyed: string; saved: string }> {
  const before = await scenario.disposition(quality, proposalId);
  const [destroyed = '', saved = ''] = before.items.map((item) => item.document.id);
  const item = before.items.find((row) => row.document.id === saved);
  const noReason = await scenario.putJson(
    `/v1/dispositions/${proposalId}/items/${item?.id ?? ''}`,
    quality.session,
    { action: 'keep', keep_reason: null },
    item?.version,
  );
  expect(noReason.status).toBe(422);
  const keep = await scenario.keep(quality, proposalId, saved, 'Tiene valor histórico.');
  expect(keep.status, keep.text).toBe(204);
  expect((await scenario.dispositionStep(quality, proposalId, 'send')).status).toBe(204);
  const sent = await scenario.disposition(quality, proposalId);
  expect(sent).toMatchObject({ status: 'in_approval', can_edit_items: false });
  expect(sent.actions).toEqual([]);
  const late = await scenario.keep(quality, proposalId, destroyed, 'Ya no se puede.');
  expect(errorCode(late)).toBe('DOC_DISPOSITION_NOT_EDITABLE');
  return { destroyed, saved };
}

/** Dirección aprueba y el worker ejecuta (dos veces: la segunda no cambia nada). */
async function approveAndExecute(proposalId: string): Promise<void> {
  const seen = await scenario.disposition(director, proposalId);
  expect(seen.actions).toEqual(['approve', 'reject']);
  expect((await scenario.dispositionStep(director, proposalId, 'approve')).status).toBe(204);
  expect(await scenario.execute()).toBeGreaterThanOrEqual(1);
  await scenario.execute();
}

describe('revisión, aprobación y ejecución', () => {
  it('Calidad conserva uno con su motivo, Dirección aprueba y queda el acta', async () => {
    const proposalId = (await scenario.propose(quality)).proposal_id ?? '';
    const { destroyed, saved } = await reviewAndSend(proposalId);
    const files = await filesOf(destroyed);
    await approveAndExecute(proposalId);
    const done = await scenario.disposition(director, proposalId);
    expect(done).toMatchObject({ status: 'executed', has_certificate: true, to_keep: 1 });
    expect((await scenario.document(quality, destroyed)).status).toBe('disposed');
    expect((await scenario.document(quality, saved)).status).toBe('obsolete');
    for (const file of await filesOf(destroyed)) expect(file.scanStatus).toBe('disposed');
    for (const file of files) await expect(storage().read(file.storageKey)).rejects.toThrow();
    const link = await scenario.post(
      `/v1/dispositions/${proposalId}/certificate`,
      director.session,
    );
    expect(link.status, link.text).toBe(200);
    expect(downloadLinkResponseSchema.parse(link.body).url).toContain('/v1/files/downloads/');
    expect((await scenario.auditActions(proposalId)).sort()).toEqual([
      'doc.disposition.approve',
      'doc.disposition.download_link',
      'doc.disposition.execute',
      'doc.disposition.propose',
      'doc.disposition.send',
    ]);
    expect(await scenario.auditActions(destroyed)).toContain('doc.document.dispose');
  });
});

describe('un documento eliminado', () => {
  it('no recibe versiones, vínculos ni otra regla', async () => {
    const disposed = await scenario.inTenant((tx) =>
      tx.docDocument.findFirstOrThrow({ where: { status: 'disposed' } }),
    );
    const version = await scenario.post(`/v1/documents/${disposed.id}/versions`, quality.session, {
      change_request_id: null,
      title: 'Otra versión',
      classification: 'internal',
      owner_position_id: null,
      source_file_id: await scenario.sourceFile(quality),
      change_summary: 'No debería poder',
    });
    expect(errorCode(version)).toBe('DOC_DOCUMENT_DISPOSED');
    const rule = await scenario.putJson(
      `/v1/documents/${disposed.id}/retention-rule`,
      quality.session,
      { retention_rule_id: null },
      disposed.version,
    );
    expect(errorCode(rule)).toBe('DOC_DOCUMENT_DISPOSED');
  });
});

describe('quién decide', () => {
  it('quien envía la propuesta no la aprueba, ni desde la ficha ni desde «Mis tareas»', async () => {
    const own = ownScenario;
    await own.seed();
    const sender = await own.person('calidad-y-direccion', ['CALIDAD', 'DIRECCION']);
    const author = await own.quality('elabora-propia');
    await own.rule(sender, { doc_type: 'PR' });
    await own.expiredDocument(author, await own.quality('aprueba-propia'));
    const proposalId = (await own.propose(sender)).proposal_id ?? '';
    expect((await own.dispositionStep(sender, proposalId, 'send')).status).toBe(204);
    expect((await own.disposition(sender, proposalId)).actions).toEqual([]);
    const self = await own.dispositionStep(sender, proposalId, 'approve');
    expect(errorCode(self)).toBe('DOC_SELF_DISPOSITION');
    const proposal = await own.disposition(sender, proposalId);
    const task = await own.openTask(proposal.workflow_instance_id ?? '');
    const fromTasks = await own.approveTask(sender, task);
    expect(errorCode(fromTasks)).toBe('DOC_SELF_DISPOSITION');
    expect((await own.disposition(sender, proposalId)).status).toBe('in_approval');
  });
});

describe('rechazo', () => {
  it('rechazar exige el motivo; lo rechazado se vuelve a proponer el mes siguiente', async () => {
    const other = rejectScenario;
    await other.seed();
    const calidad = await other.quality('calidad-rechazo');
    const direccion = await other.director();
    await other.rule(calidad, { doc_type: 'PR' });
    const id = await other.expiredDocument(calidad, await other.quality('aprueba-rechazo'));
    const proposalId = (await other.propose(calidad)).proposal_id ?? '';
    await other.dispositionStep(calidad, proposalId, 'send');
    const noComment = await other.dispositionStep(direccion, proposalId, 'reject');
    expect(noComment.status).toBeGreaterThanOrEqual(400);
    const rejected = await other.dispositionStep(direccion, proposalId, 'reject', 'Falta revisar');
    expect(rejected.status, rejected.text).toBe(204);
    await other.execute();
    expect((await other.document(calidad, id)).status).toBe('obsolete');
    expect((await other.propose(calidad)).created).toBe(false);
    other.clock.advance(32 * 24 * 60 * 60 * 1000);
    const later = await other.refresh(calidad);
    const next = await other.propose(later);
    expect(next.created).toBe(true);
    const items = (await other.disposition(later, next.proposal_id ?? '')).items;
    expect(items.map((item) => item.document.id)).toContain(id);
  });
});

describe('regla cambiada', () => {
  it('si la regla cambió y ya no venció, la propuesta no se puede aprobar', async () => {
    const other = changeScenario;
    await other.seed();
    const calidad = await other.quality('calidad-cambio');
    const direccion = await other.director();
    const ruleId = await other.rule(calidad, { doc_type: 'PR' });
    await other.expiredDocument(calidad, await other.quality('aprueba-cambio'));
    const proposalId = (await other.propose(calidad)).proposal_id ?? '';
    await other.dispositionStep(calidad, proposalId, 'send');
    const longer = { ...other.ruleBody({ archive_years: 50 }), code: undefined, is_active: true };
    const edit = await other.putJson(`/v1/retention-rules/${ruleId}`, calidad.session, longer, 1);
    expect(edit.status, edit.text).toBe(204);
    const approve = await other.dispositionStep(direccion, proposalId, 'approve');
    expect(errorCode(approve)).toBe('DOC_DISPOSITION_NOT_EDITABLE');
    expect((await other.disposition(direccion, proposalId)).status).toBe('in_approval');
  });
});

describe('la base de datos tampoco lo permite', () => {
  it('sin propuesta aprobada, un documento vencido no se marca eliminado', async () => {
    const id = await scenario.expiredDocument(quality, approver);
    const attempt = scenario.inTenant((tx) =>
      tx.docDocument.update({
        where: { id },
        data: { status: 'disposed', disposedAt: new Date() },
      }),
    );
    await expect(attempt).rejects.toThrow(/regla de retención vencida y aprobación/u);
  });

  it('un documento sin vencer no se marca eliminado aunque esté en una propuesta aprobada', async () => {
    const id = await scenario.obsoleteDocument(quality, approver);
    const attempt = scenario.inTenant(async (tx) => {
      const proposal = await tx.docDispositionProposal.findFirstOrThrow({
        where: { status: 'executed' },
      });
      const rule = await tx.docRetentionRule.findFirstOrThrow({ where: { docType: 'PR' } });
      await tx.docDisposition.create({
        data: {
          tenantId: scenario.tenant.id,
          proposalId: proposal.id,
          documentId: id,
          retentionRuleId: rule.id,
          dueOn: new Date('2000-01-01T00:00:00Z'),
        },
      });
    });
    await expect(attempt).rejects.toThrow(/propuesta en revisión/u);
    const direct = scenario.inTenant((tx) =>
      tx.docDocument.update({
        where: { id },
        data: { status: 'disposed', disposedAt: new Date() },
      }),
    );
    await expect(direct).rejects.toThrow(/regla de retención vencida y aprobación/u);
  });
});

describe('la base de datos tampoco lo permite: archivos y eliminados', () => {
  it('el archivo de un documento que no se eliminó no se marca eliminado', async () => {
    const id = await scenario.obsoleteDocument(quality, approver);
    const [file] = await filesOf(id);
    const attempt = scenario.inTenant((tx) =>
      tx.file.update({ where: { id: file?.id ?? '' }, data: { scanStatus: 'disposed' } }),
    );
    await expect(attempt).rejects.toThrow(/ya analizado no se puede cambiar/u);
  });

  it('un documento eliminado ya no cambia', async () => {
    const attempt = scenario.inTenant(async (tx) => {
      const disposed = await tx.docDocument.findFirstOrThrow({ where: { status: 'disposed' } });
      await tx.docDocument.update({ where: { id: disposed.id }, data: { retentionRuleId: null } });
    });
    await expect(attempt).rejects.toThrow(/no se puede cambiar/u);
  });
});

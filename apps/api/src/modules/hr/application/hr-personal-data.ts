import { recordAuditEvent } from '../../../platform/audit/audit-recorder.js';
import { bogotaToday, fromCalendarDate } from '../../core/index.js';
import { disposeAttachedFile } from '../../doc/index.js';
import {
  outcomeFor,
  shownDate,
  type ErasureOutcome,
  type PersonalDataSource,
} from '../../privacy/index.js';

// Lo que Talento humano guarda de un titular, para Privacidad (B42, decisión 8). La historia
// laboral de un colaborador se conserva por deber legal y queda bloqueada; las candidaturas que no
// terminaron en contratación se suprimen: hoja de vida retirada y notas de evaluación borradas.
// Los conceptos médicos y el proceso disciplinario no salen en la entrega: el titular los pide por
// el canal reservado de cada uno.

const LABOR_RETENTION =
  'Historia laboral: se conserva por las obligaciones laborales y de seguridad social del empleador (Código Sustantivo del Trabajo).';

/**
 * La base de datos solo admite suprimir una candidatura descartada: si sigue en curso, queda
 * descartada hoy con el motivo de la supresión (su retención ya no aplica: los datos se borran).
 */
function discardedFor(candidate: { readonly stage: string }, at: Date) {
  const reason = { talentBank: false, discardReason: 'Datos suprimidos a pedido del titular' };
  if (candidate.stage === 'discarded') return reason;
  const discardedOn = fromCalendarDate(bogotaToday(at));
  const retentionUntil = new Date(discardedOn.getTime() + 86_400_000);
  return { ...reason, stage: 'discarded', discardedOn, retentionUntil };
}

export const HR_PERSONAL_DATA: PersonalDataSource = {
  key: 'hr',
  title: 'Talento humano',
  async collect(tx, holder) {
    const employees = await tx.hrEmployee.findMany({
      where: { partyId: holder.partyId, deletedAt: null },
      orderBy: { hireDate: 'asc' },
    });
    const candidates = await tx.hrCandidate.findMany({
      where: { partyId: holder.partyId, erasedAt: null, deletedAt: null },
      include: { vacancy: { select: { code: true } } },
      orderBy: { appliedOn: 'asc' },
    });
    return [
      ...employees.map((row) => ({
        title: 'Vinculación laboral',
        fields: [
          { label: 'Ingreso', value: shownDate(row.hireDate) },
          { label: 'Retiro', value: shownDate(row.terminationDate) },
          { label: 'Correo de trabajo', value: row.workEmail },
          { label: 'Modalidad', value: row.workMode },
        ],
      })),
      ...candidates.map((row) => ({
        title: `Candidatura a la vacante ${row.vacancy.code}`,
        fields: [
          { label: 'Se postuló', value: shownDate(row.appliedOn) },
          { label: 'Etapa', value: row.stage },
          { label: 'Hoja de vida', value: row.resumeFileId === null ? 'No' : 'Sí' },
          { label: 'Banco de hojas de vida', value: row.talentBank ? 'Sí' : 'No' },
        ],
      })),
    ];
  },
  async erase(tx, holder, actor): Promise<ErasureOutcome> {
    const employees = await tx.hrEmployee.count({ where: { partyId: holder.partyId } });
    const candidates = await tx.hrCandidate.findMany({
      where: { partyId: holder.partyId, erasedAt: null, deletedAt: null },
    });
    if (employees > 0) return outcomeFor(employees + candidates.length, 'blocked', LABOR_RETENTION);
    const storageKeys: string[] = [];
    for (const candidate of candidates) {
      const key =
        candidate.resumeFileId === null
          ? null
          : await disposeAttachedFile(tx, candidate.resumeFileId, actor.at);
      if (key !== null) storageKeys.push(key);
      await tx.hrCandidate.update({
        where: { id: candidate.id },
        data: { ...discardedFor(candidate, actor.at), erasedAt: actor.at, resumeFileId: null },
      });
      await tx.hrSelectionEvaluation.updateMany({
        where: { candidateId: candidate.id, deletedAt: null },
        data: { note: null, evaluatorId: null, deletedAt: actor.at },
      });
      await recordAuditEvent(tx, {
        tenantId: actor.tenantId,
        occurredAt: actor.at,
        actor: actor.userId === null ? { kind: 'system' } : { kind: 'user', id: actor.userId },
        action: 'hr.candidate.erase',
        entityType: 'hr_candidate',
        entityId: candidate.id,
        result: 'success',
        changes: { request_code: actor.requestCode, resume: candidate.resumeFileId !== null },
        meta: actor.meta,
      });
    }
    return { ...outcomeFor(candidates.length, 'erased'), storageKeys };
  },
};

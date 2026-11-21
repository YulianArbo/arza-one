import type { HrRef } from '@arza/contracts';

import type { TenantTransaction } from '../../../platform/database/tenant-context.js';
import type { RequestMeta } from '../../../platform/http/request-meta.js';
import { fromCalendarDate, toCalendarDate } from '../../core/index.js';
import { auditHr, employeeRefs } from './hr-support.js';
import { checklistOf } from './offboarding-views.js';

// Lo que Seguridad y salud en el trabajo (B37) pide a Talento humano: los colaboradores activos con
// su nombre y su cuenta, y dar por hecha la evaluación médica de ingreso (tarea de inducción) o de
// egreso (ítem del retiro) cuando SST registra el concepto (decisión 13). SST nunca lee las tablas
// hr_ directamente.

export interface SstEmployee extends HrRef {
  readonly userId: string | null;
}

/** Los colaboradores activos con su nombre, en orden alfabético. */
export async function activeEmployeesForSst(tx: TenantTransaction): Promise<SstEmployee[]> {
  const rows = await tx.hrEmployee.findMany({
    where: { status: 'active', deletedAt: null },
    select: { id: true, partyId: true, userId: true },
  });
  const refs = await employeeRefs(tx, rows);
  return rows
    .map((row) => ({
      ...(refs.get(row.id) ?? { id: row.id, name: 'Colaborador' }),
      userId: row.userId,
    }))
    .sort((a, b) => a.name.localeCompare(b.name, 'es'));
}

/** El colaborador activo, o null si no existe o ya no está activo. */
export async function activeEmployeeForSst(
  tx: TenantTransaction,
  employeeId: string,
): Promise<SstEmployee | null> {
  const row = await tx.hrEmployee.findFirst({
    where: { id: employeeId, status: 'active', deletedAt: null },
    select: { id: true, partyId: true, userId: true },
  });
  if (row === null) return null;
  const name = (await employeeRefs(tx, [row])).get(row.id)?.name ?? 'Colaborador';
  return { id: row.id, name, userId: row.userId };
}

/** El colaborador activo de la cuenta, o null si la cuenta no está vinculada. */
export async function employeeIdOfUser(
  tx: TenantTransaction,
  userId: string,
): Promise<string | null> {
  const row = await tx.hrEmployee.findFirst({
    where: { userId, status: 'active', deletedAt: null },
    orderBy: { hireDate: 'desc' },
    select: { id: true },
  });
  return row?.id ?? null;
}

/** Nombre de los colaboradores (también los retirados), por su identificador. */
export async function employeeNamesForSst(
  tx: TenantTransaction,
  ids: readonly string[],
): Promise<Map<string, HrRef>> {
  if (ids.length === 0) return new Map();
  const rows = await tx.hrEmployee.findMany({
    where: { id: { in: [...new Set(ids)] } },
    select: { id: true, partyId: true },
  });
  return employeeRefs(tx, rows);
}

export interface ExamLink {
  readonly tenantId: string;
  readonly userId: string;
  readonly at: Date;
  readonly meta: RequestMeta;
}

/** Da por hecha la tarea de inducción de la evaluación médica de ingreso, si sigue abierta. */
async function completeEntryExam(
  tx: TenantTransaction,
  actor: ExamLink,
  employeeId: string,
  doneOn: string,
): Promise<boolean> {
  const updated = await tx.hrOnboardingTask.updateMany({
    where: { employeeId, kind: 'medical_exam', doneOn: null, deletedAt: null },
    data: { doneOn: fromCalendarDate(doneOn), doneBy: actor.userId, note: 'Registrada por SST' },
  });
  if (updated.count === 0) return false;
  await auditHr(tx, actor, {
    action: 'hr.onboarding.complete',
    entityType: 'hr_employee',
    entityId: employeeId,
    changes: { kind: 'medical_exam', done_on: doneOn, by: 'sst' },
  });
  return true;
}

/** Da por hecho el ítem del examen de egreso del retiro en curso, si sigue pendiente. */
async function completeExitExam(
  tx: TenantTransaction,
  actor: ExamLink,
  employeeId: string,
  doneOn: string,
): Promise<boolean> {
  const row = await tx.hrOffboarding.findFirst({
    where: { employeeId, status: 'in_progress', deletedAt: null },
  });
  const entry = row === null ? undefined : checklistOf(row).find((e) => e.item === 'exit_exam');
  if (row === null || entry?.done_on !== null) return false;
  const checklist = checklistOf(row).map((e) =>
    e.item === 'exit_exam'
      ? { ...e, done_on: doneOn, done_by: actor.userId, note: 'Registrado por SST' }
      : e,
  );
  await tx.hrOffboarding.update({ where: { id: row.id }, data: { checklist } });
  await auditHr(tx, actor, {
    action: 'hr.offboarding.item',
    entityType: 'hr_offboarding',
    entityId: row.id,
    changes: { item: 'exit_exam', done_on: doneOn, by: 'sst' },
  });
  return true;
}

/** La evaluación de ingreso o de egreso cierra lo que Talento humano tenía pendiente. */
export async function linkOccupationalExam(
  tx: TenantTransaction,
  actor: ExamLink,
  exam: { readonly employeeId: string; readonly kind: string; readonly examDate: Date },
): Promise<boolean> {
  const doneOn = toCalendarDate(exam.examDate);
  if (exam.kind === 'entry') return completeEntryExam(tx, actor, exam.employeeId, doneOn);
  if (exam.kind === 'exit') return completeExitExam(tx, actor, exam.employeeId, doneOn);
  return false;
}

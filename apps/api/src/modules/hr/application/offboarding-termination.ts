import { AUTOMATIC_CONCEPTS } from '@arza/contracts';

import type { HrEmployee, HrOffboarding } from '../../../generated/prisma/client.js';
import { recordAuditEvent } from '../../../platform/audit/audit-recorder.js';
import type { TenantTransaction } from '../../../platform/database/tenant-context.js';
import type { RequestMeta } from '../../../platform/http/request-meta.js';
import { addOutboxEvent } from '../../../platform/outbox/outbox.js';
import { toCalendarDate } from '../../core/index.js';
import { revokeEmployeeAccess } from '../../iam/index.js';
import { periodOf } from '../domain/leave-days.js';
import { addAutomaticNovelty } from './payroll-sync.js';

// Fin del último día laborado (numerales 13.3 «employee.terminated» y 15.1 «Retiro», decisión 9):
// la cuenta queda inactiva y sin sesiones, el colaborador pasa a «Retirado», la novedad de retiro
// llega a nómina y se emite «employee.terminated». Lo hace el trabajo diario a medianoche, o en el
// acto si el retiro se registra cuando el último día ya pasó.

export interface TerminationActor {
  readonly tenantId: string;
  /** Quien registró el retiro, o null si lo hace el trabajo diario. */
  readonly userId: string | null;
  readonly at: Date;
  readonly meta: RequestMeta | null;
}

/** Cierra el acceso de la cuenta, si la tiene; devuelve cuántas sesiones cerró. */
async function closeAccess(
  tx: TenantTransaction,
  actor: TerminationActor,
  employee: HrEmployee,
): Promise<number> {
  if (employee.userId === null) return 0;
  return revokeEmployeeAccess(tx, {
    tenantId: actor.tenantId,
    userId: employee.userId,
    actorId: actor.userId,
    at: actor.at,
  });
}

/** La novedad de retiro en el mes del último día (o el siguiente abierto). */
async function terminationNovelty(
  tx: TenantTransaction,
  actor: TerminationActor,
  offboarding: HrOffboarding,
  lastDay: string,
): Promise<void> {
  await addAutomaticNovelty(tx, {
    tenantId: actor.tenantId,
    period: periodOf(lastDay),
    employeeId: offboarding.employeeId,
    concept: AUTOMATIC_CONCEPTS.termination,
    quantity: '1',
    unit: 'units',
    startsOn: lastDay,
    endsOn: lastDay,
    source: 'offboarding',
    sourceId: offboarding.id,
    note: null,
  });
}

async function recordTermination(
  tx: TenantTransaction,
  actor: TerminationActor,
  offboarding: HrOffboarding,
  facts: { readonly employee: HrEmployee; readonly lastDay: string; readonly sessions: number },
): Promise<void> {
  await recordAuditEvent(tx, {
    tenantId: actor.tenantId,
    occurredAt: actor.at,
    actor: actor.userId === null ? { kind: 'system' } : { kind: 'user', id: actor.userId },
    action: 'hr.offboarding.terminate',
    entityType: 'hr_offboarding',
    entityId: offboarding.id,
    result: 'success',
    changes: {
      employee_status: 'terminated',
      last_day: facts.lastDay,
      sessions_closed: facts.sessions,
    },
    meta: actor.meta,
  });
  await addOutboxEvent(tx, {
    tenantId: actor.tenantId,
    actorId: actor.userId,
    occurredAt: actor.at,
    eventType: 'employee.terminated',
    payload: {
      employee_id: facts.employee.id,
      user_id: facts.employee.userId,
      last_day: facts.lastDay,
    },
  });
}

export async function applyTermination(
  tx: TenantTransaction,
  actor: TerminationActor,
  offboarding: HrOffboarding,
  employee: HrEmployee,
): Promise<void> {
  const lastDay = toCalendarDate(offboarding.lastDay);
  const sessions = await closeAccess(tx, actor, employee);
  await tx.hrEmployee.update({
    where: { id: employee.id },
    data: { status: 'terminated', terminationDate: offboarding.lastDay },
  });
  await tx.hrOffboarding.update({
    where: { id: offboarding.id },
    data: { accountDeactivatedAt: actor.at },
  });
  await terminationNovelty(tx, actor, offboarding, lastDay);
  await recordTermination(tx, actor, offboarding, { employee, lastDay, sessions });
}

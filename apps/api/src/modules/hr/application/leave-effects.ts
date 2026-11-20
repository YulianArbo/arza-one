import type { HrLeaveRequest } from '../../../generated/prisma/client.js';
import type { TenantTransaction } from '../../../platform/database/tenant-context.js';
import { addOutboxEvent } from '../../../platform/outbox/outbox.js';
import { toCalendarDate, workCalendarBetween } from '../../core/index.js';
import { activeUsersWithRoles } from '../../iam/index.js';
import { leaveByMonth } from '../domain/leave-days.js';
import type { HrActor } from './hr-support.js';
import { addAutomaticNovelty, leaveConcept } from './payroll-sync.js';

// Lo que desencadena una ausencia: las novedades de nómina de cada mes que toca (decisión 6) y los
// avisos al jefe o al colaborador. Los eventos no llevan datos personales: solo identificadores.

/** Una novedad por cada mes que toca la ausencia aprobada. */
export async function addLeaveNovelties(
  tx: TenantTransaction,
  tenantId: string,
  leave: HrLeaveRequest,
): Promise<void> {
  const from = toCalendarDate(leave.startsOn);
  const to = toCalendarDate(leave.endsOn);
  const calendar = await workCalendarBetween(tx, from, to);
  for (const slice of leaveByMonth(leave.type, from, to, calendar)) {
    await addAutomaticNovelty(tx, {
      tenantId,
      period: slice.period,
      employeeId: leave.employeeId,
      concept: leaveConcept(leave.type),
      quantity: String(slice.days),
      unit: 'days',
      startsOn: slice.from,
      endsOn: slice.to,
      source: 'leave',
      sourceId: leave.id,
      note: null,
    });
  }
}

/** Quién recibe el aviso de una solicitud: el jefe, o Talento humano si no hay jefe. */
async function deciders(tx: TenantTransaction, approverId: string | null, at: Date) {
  if (approverId !== null) return [approverId];
  return activeUsersWithRoles(tx, ['TALENTO_HUMANO'], at);
}

export interface LeaveAnnouncement {
  readonly leaveId: string;
  readonly approverId: string | null;
  readonly kind: 'requested';
}

export interface LeaveDecisionAnnouncement {
  readonly leaveId: string;
  readonly employeeUserId: string | null;
  readonly kind: 'approved' | 'rejected';
}

/** Evento de la ausencia para los avisos («hr.leave.requested» o «hr.leave.decided»). */
export async function announceLeave(
  tx: TenantTransaction,
  actor: HrActor,
  event: LeaveAnnouncement | LeaveDecisionAnnouncement,
): Promise<void> {
  const recipients =
    event.kind === 'requested'
      ? await deciders(tx, event.approverId, actor.at)
      : event.employeeUserId === null
        ? []
        : [event.employeeUserId];
  await addOutboxEvent(tx, {
    tenantId: actor.tenantId,
    actorId: actor.userId,
    occurredAt: actor.at,
    eventType: event.kind === 'requested' ? 'hr.leave.requested' : 'hr.leave.decided',
    payload: { leave_id: event.leaveId, decision: event.kind, recipients },
  });
}

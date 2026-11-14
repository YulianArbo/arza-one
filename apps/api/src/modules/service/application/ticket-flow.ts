import {
  canTicketStep,
  SLA_RULES,
  TICKET_STATUSES,
  ticketStatusSchema,
  type PersonRef,
  type TicketAction,
} from '@arza/contracts';

import type { Prisma, SvcTicket } from '../../../generated/prisma/client.js';
import type { TenantTransaction } from '../../../platform/database/tenant-context.js';
import { versionConflict } from '../../../platform/http/if-match.js';
import { bogotaToday, businessDeadline } from '../../core/index.js';
import { activeUsersWithRoles } from '../../iam/index.js';
import { resumedClock } from './sla-clock.js';
import {
  peopleNames,
  personRef,
  recordServiceChange,
  statusInvalid,
  type ServiceActor,
} from './service-support.js';
import type { TicketWithLinks } from './ticket-records.js';
import { ticketAudit, ticketPayload } from './tickets.js';

// El motor de los pasos del tiquete (B28): comprueba el estado con la misma tabla que usa la ficha
// (TICKET_ACTIONS), cambia el tiquete con la versión que se vio y deja la auditoría y el evento. Lo
// usan las acciones de las personas, la conversación (el cliente respondió) y el worker (cierre
// automático).

/** Pueden atender tiquetes: Servicio al cliente y el Líder técnico (decisión 3). */
const ASSIGNABLE_ROLES = ['SERVICIO', 'LIDER_TECNICO'] as const;

export async function assignablePeople(tx: TenantTransaction, now: Date): Promise<string[]> {
  return activeUsersWithRoles(tx, ASSIGNABLE_ROLES, now);
}

/** Las mismas personas con su nombre, en orden alfabético: las opciones de «asignar a». */
export async function assigneeOptions(tx: TenantTransaction, now: Date): Promise<PersonRef[]> {
  const ids = await assignablePeople(tx, now);
  const names = await peopleNames(tx, ids);
  const people = ids.flatMap((personId) => {
    const ref = personRef(names, personId);
    return ref === null ? [] : [ref];
  });
  return people.sort((a, b) => a.name.localeCompare(b.name, 'es'));
}

export interface Step {
  readonly action: TicketAction;
  readonly data: Prisma.SvcTicketUpdateManyMutationInput;
  readonly changes?: Record<string, Prisma.InputJsonValue | null>;
}

/** Fin del quinto día hábil después de resolver: entonces se cierra solo (decisión 7). */
export async function autoCloseAt(tx: TenantTransaction, at: Date): Promise<Date> {
  const day = await businessDeadline(tx, bogotaToday(at), SLA_RULES.autoCloseBusinessDays);
  return new Date(`${day}T23:59:00-05:00`);
}

/** Aplica un paso con la versión que se vio; lo comparte el cierre automático del worker. */
export async function applyStep(
  tx: TenantTransaction,
  actor: ServiceActor,
  ticket: SvcTicket,
  version: number,
  step: Step,
): Promise<void> {
  const status = ticketStatusSchema.parse(ticket.status);
  if (!canTicketStep(step.action, status)) {
    throw statusInvalid(`Un tiquete «${TICKET_STATUSES[status]}» no admite ese paso.`);
  }
  const { count } = await tx.svcTicket.updateMany({
    where: { id: ticket.id, version, status: ticket.status, deletedAt: null },
    data: step.data,
  });
  if (count === 0) throw versionConflict();
  const after = await tx.svcTicket.findUniqueOrThrow({ where: { id: ticket.id } });
  await recordServiceChange(tx, actor, {
    action: `service.ticket.${step.action}`,
    event: `service.ticket.${pastOf(step.action)}`,
    entityType: 'svc_ticket',
    entityId: ticket.id,
    changes: {
      ...ticketAudit(after),
      status: [ticket.status, after.status],
      ...(step.changes ?? {}),
    },
    payload: { ...ticketPayload(after), level: after.level },
  });
}

const PAST: Readonly<Record<TicketAction, string>> = {
  assign: 'assigned',
  escalate: 'escalated',
  start: 'started',
  wait: 'paused',
  resume: 'resumed',
  resolve: 'resolved',
  reopen: 'reopened',
  close: 'closed',
};

function pastOf(action: TicketAction): string {
  return PAST[action];
}

/** Cerrar un resuelto: a mano o, pasados los días hábiles, por el sistema. */
export function closeStep(at: Date): Step {
  return { action: 'close', data: { status: 'closed', closedAt: at, autoCloseAt: null } };
}

/** Reanudar: a mano o porque el cliente respondió (mensaje del cliente). */
export async function resumeTicket(
  tx: TenantTransaction,
  actor: ServiceActor,
  ticket: TicketWithLinks,
  version: number,
): Promise<void> {
  const clock = await resumedClock(tx, ticket.slaPolicy, ticket, actor.at);
  await applyStep(tx, actor, ticket, version, {
    action: 'resume',
    data: { status: 'in_progress', ...clock },
  });
}

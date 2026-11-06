import {
  slaCalendarSchema,
  ticketCategorySchema,
  ticketChannelSchema,
  ticketPrioritySchema,
  ticketStatusSchema,
  type PermissionCode,
  type TicketDetail,
  type TicketSummary,
} from '@arza/contracts';

import type { SlaPolicy, SvcTicket, SvcWarranty } from '../../../generated/prisma/client.js';
import {
  canOnRecord,
  hasUnconditionalPermission,
  type AppAbility,
} from '../../../platform/access/ability.js';
import { permissionDenied } from '../../../platform/access/permission-denied.js';
import type { TenantTransaction } from '../../../platform/database/tenant-context.js';
import { bogotaToday, toCalendarDate } from '../../core/index.js';
import { clockState } from '../domain/ticket-clock.js';
import { personRef, serviceNotFound } from './service-support.js';

// Quién ve y quién hace qué con un tiquete (B28, decisión 9). Servicio al cliente y el Líder técnico
// ven y atienden todos; el Equipo de proyecto y los colaboradores ven solo los que pidieron, los que
// registraron o los que tienen asignados; Dirección, Calidad, Comercial y Auditoría solo leen. Para
// quien no puede verlo, un tiquete ajeno «no existe» (numeral 15.5).

export type TicketWithLinks = SvcTicket & {
  readonly slaPolicy: SlaPolicy;
  readonly warranty: SvcWarranty | null;
};

export const TICKET_LINKS = { slaPolicy: true, warranty: true } as const;

/** Las personas del tiquete: para el permiso «solo lo propio». */
export function involvedIn(ticket: Pick<SvcTicket, 'requesterId' | 'assigneeId' | 'createdBy'>): {
  involved_user_ids: string[];
} {
  const ids = [ticket.requesterId, ticket.assigneeId, ticket.createdBy];
  return { involved_user_ids: ids.filter((id): id is string => id !== null) };
}

export function canOnTicket(ability: AppAbility, code: PermissionCode, ticket: SvcTicket): boolean {
  return canOnRecord(ability, code, involvedIn(ticket));
}

/** El tiquete con su acuerdo y su garantía, si la persona puede verlo; si no, «no existe». */
export async function findVisibleTicket(
  tx: TenantTransaction,
  ability: AppAbility,
  id: string,
): Promise<TicketWithLinks> {
  const ticket = await tx.svcTicket.findFirst({
    where: { id, deletedAt: null },
    include: TICKET_LINKS,
  });
  if (ticket === null || !canOnTicket(ability, 'service.ticket.read', ticket)) {
    throw serviceNotFound('El tiquete');
  }
  return ticket;
}

/** Como findVisibleTicket, y además exige el permiso sobre todos los tiquetes. */
export async function ticketFor(
  tx: TenantTransaction,
  ability: AppAbility,
  id: string,
  code: PermissionCode,
): Promise<TicketWithLinks> {
  const ticket = await findVisibleTicket(tx, ability, id);
  if (!hasUnconditionalPermission(ability, code)) throw permissionDenied();
  return ticket;
}

/** Atiende tiquetes: escribe al cliente, notas internas y mueve el recorrido. */
export function isAgent(ability: AppAbility): boolean {
  return hasUnconditionalPermission(ability, 'service.ticket.resolve');
}

export function isRequester(ticket: SvcTicket, userId: string): boolean {
  return ticket.requesterId === userId;
}

export function inWarranty(warranty: SvcWarranty | null, now: Date): boolean {
  return warranty !== null && toCalendarDate(warranty.endsOn) >= bogotaToday(now);
}

export function ticketSummary(
  ticket: TicketWithLinks,
  names: ReadonlyMap<string, string>,
  parties: ReadonlyMap<string, string>,
  now: Date,
): TicketSummary {
  return {
    id: ticket.id,
    code: ticket.code,
    subject: ticket.subject,
    status: ticketStatusSchema.parse(ticket.status),
    priority: ticketPrioritySchema.parse(ticket.priority),
    level: ticket.level,
    category: ticketCategorySchema.parse(ticket.category),
    party:
      ticket.partyId === null
        ? null
        : { id: ticket.partyId, name: parties.get(ticket.partyId) ?? 'Cliente' },
    assignee: personRef(names, ticket.assigneeId),
    requester: personRef(names, ticket.requesterId),
    response_due_at: ticket.responseDueAt?.toISOString() ?? null,
    resolution_due_at: ticket.resolutionDueAt?.toISOString() ?? null,
    first_response_at: ticket.firstResponseAt?.toISOString() ?? null,
    clock: clockState({ ...ticket, status: ticketStatusSchema.parse(ticket.status) }, now),
    in_warranty: inWarranty(ticket.warranty, now),
    created_at: ticket.createdAt.toISOString(),
  };
}

export interface DetailLinks {
  readonly project: { readonly id: string; readonly code: string; readonly name: string } | null;
  readonly deliverable: { readonly id: string; readonly name: string } | null;
}

export function ticketDetail(
  ticket: TicketWithLinks,
  summary: TicketSummary,
  names: ReadonlyMap<string, string>,
  links: DetailLinks,
  can: TicketDetail['can'],
): TicketDetail {
  return {
    ...summary,
    description: ticket.description,
    channel: ticketChannelSchema.parse(ticket.channel),
    requester_name: ticket.requesterName,
    project: links.project,
    deliverable: links.deliverable,
    warranty:
      ticket.warranty === null
        ? null
        : { id: ticket.warranty.id, ends_on: toCalendarDate(ticket.warranty.endsOn) },
    sla: {
      calendar: slaCalendarSchema.parse(ticket.slaPolicy.calendar),
      first_response_hours: ticket.slaPolicy.firstResponseHours.toNumber(),
      resolution_hours: ticket.slaPolicy.resolutionHours.toNumber(),
    },
    paused_at: ticket.pausedAt?.toISOString() ?? null,
    resolved_at: ticket.resolvedAt?.toISOString() ?? null,
    resolution: ticket.resolution,
    auto_close_at: ticket.autoCloseAt?.toISOString() ?? null,
    closed_at: ticket.closedAt?.toISOString() ?? null,
    created_by: personRef(names, ticket.createdBy),
    version: ticket.version,
    can,
  };
}

/** Qué puede hacer la persona con este tiquete; la API lo vuelve a comprobar en cada acción. */
export function ticketAbilities(
  ability: AppAbility,
  ticket: SvcTicket,
  userId: string,
): TicketDetail['can'] {
  const open = !['resolved', 'closed'].includes(ticket.status);
  const agent = isAgent(ability);
  const assign = hasUnconditionalPermission(ability, 'service.ticket.assign');
  return {
    update: open && assign,
    assign: open && assign,
    work: open && agent,
    reopen: ticket.status === 'resolved' && (agent || isRequester(ticket, userId)),
    close:
      ticket.status === 'resolved' && hasUnconditionalPermission(ability, 'service.ticket.close'),
    write_internal: ticket.status !== 'closed' && agent,
    write_public: ticket.status !== 'closed' && (agent || isRequester(ticket, userId)),
    propose_compensation: ticket.status !== 'new' && agent,
    decide_compensation: hasUnconditionalPermission(ability, 'service.compensation.approve'),
  };
}

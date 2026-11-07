import { Inject, Injectable } from '@nestjs/common';
import type { CreateTicketRequest, TicketPriority, UpdateTicketRequest } from '@arza/contracts';

import type { SvcTicket } from '../../../generated/prisma/client.js';
import { hasUnconditionalPermission, type AppAbility } from '../../../platform/access/ability.js';
import type { Principal } from '../../../platform/access/principal.js';
import { CLOCK, type Clock } from '../../../platform/clock/clock.js';
import { DatabaseService } from '../../../platform/database/database.service.js';
import type { TenantTransaction } from '../../../platform/database/tenant-context.js';
import { versionConflict } from '../../../platform/http/if-match.js';
import type { RequestMeta } from '../../../platform/http/request-meta.js';
import { nextBusinessCode } from '../../core/index.js';
import { freshClock, reprioritizedClock } from './sla-clock.js';
import { policyFor } from './sla-policies.js';
import {
  recordServiceChange,
  serviceActorOf,
  statusInvalid,
  type ServiceActor,
  type ServiceTarget,
} from './service-support.js';
import { resolveLinks, type TicketLinks } from './ticket-links.js';
import { ticketFor } from './ticket-records.js';

// Registro y edición de tiquetes (B28, FT-SAC-001). Servicio al cliente registra lo que llega por
// correo, teléfono o en persona a nombre del cliente; un colaborador registra su propia solicitud
// (como una falla de ARZA ONE, capítulo 22). El reloj arranca al registrarlo. Un tiquete crítico
// activa el protocolo PT-TEC-003: el evento avisa de inmediato (decisión 5).

const TICKET_SEQUENCE = 'svc.ticket';
const TICKETS = { name: 'Tiquetes de la mesa de ayuda', prefix: 'TIQ', padding: 4 } as const;

/** Lo que va en la auditoría de un tiquete: sin datos personales. */
export function ticketAudit(ticket: SvcTicket): Record<string, string | number | null> {
  return {
    code: ticket.code,
    status: ticket.status,
    priority: ticket.priority,
    level: ticket.level,
    category: ticket.category,
    assignee_id: ticket.assigneeId,
  };
}

/** Lo que va en el evento: identificadores y códigos, nunca datos personales. */
export function ticketPayload(ticket: SvcTicket): Record<string, string | null> {
  return {
    code: ticket.code,
    priority: ticket.priority,
    status: ticket.status,
    assignee_id: ticket.assigneeId,
    requester_id: ticket.requesterId,
  };
}

function ticketFields(input: UpdateTicketRequest) {
  return {
    subject: input.subject,
    description: input.description,
    category: input.category,
    priority: input.priority,
    requesterName: input.requester_name,
  };
}

function linkData(links: TicketLinks) {
  return {
    partyId: links.partyId,
    projectId: links.projectId,
    deliverableId: links.deliverableId,
    warrantyId: links.warrantyId,
  };
}

function updateAudit(ticket: SvcTicket, input: UpdateTicketRequest, links: TicketLinks) {
  return {
    ...ticketAudit(ticket),
    priority: [ticket.priority, input.priority],
    category: [ticket.category, input.category],
    project_id: [ticket.projectId, links.projectId],
    deliverable_id: [ticket.deliverableId, links.deliverableId],
  };
}

@Injectable()
export class TicketsUseCase {
  constructor(
    @Inject(DatabaseService) private readonly database: DatabaseService,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  async create(
    principal: Principal,
    ability: AppAbility,
    input: CreateTicketRequest,
    meta: RequestMeta,
  ): Promise<string> {
    const actor = serviceActorOf(principal, meta, this.clock.now());
    // Quien registra solo lo propio es quien lo pide; Servicio registra a nombre del cliente.
    const forSelf = !hasUnconditionalPermission(ability, 'service.ticket.create');
    return this.database.withTenant(principal, async (tx) => {
      const links = await resolveLinks(tx, input, actor.at);
      const policy = await policyFor(tx, actor, input.priority);
      const ticket = await tx.svcTicket.create({
        data: {
          tenantId: actor.tenantId,
          code: await nextBusinessCode(tx, TICKET_SEQUENCE, actor.at, TICKETS),
          ...ticketFields(input),
          channel: input.channel,
          requesterId: forSelf ? principal.userId : null,
          slaPolicyId: policy.id,
          ...linkData(links),
          ...(await freshClock(tx, policy, actor.at)),
        },
      });
      await recordServiceChange(tx, actor, {
        action: 'service.ticket.create',
        event: 'service.ticket.created',
        entityType: 'svc_ticket',
        entityId: ticket.id,
        changes: { ...ticketAudit(ticket), in_warranty: links.warrantyId !== null },
        payload: ticketPayload(ticket),
      });
      return ticket.id;
    });
  }

  async update(
    principal: Principal,
    ability: AppAbility,
    target: ServiceTarget,
    input: UpdateTicketRequest,
    meta: RequestMeta,
  ): Promise<void> {
    const actor = serviceActorOf(principal, meta, this.clock.now());
    await this.database.withTenant(principal, async (tx) => {
      const ticket = await ticketFor(tx, ability, target.id, 'service.ticket.assign');
      if (ticket.status === 'resolved' || ticket.status === 'closed') {
        throw statusInvalid('Un tiquete resuelto o cerrado no se edita. Reábralo primero.');
      }
      const links = await resolveLinks(tx, input, actor.at);
      const clock = await this.clockFor(tx, actor, ticket, input.priority);
      const { count } = await tx.svcTicket.updateMany({
        where: { id: ticket.id, version: target.version, deletedAt: null },
        data: {
          ...ticketFields(input),
          ...linkData(links),
          ...clock,
        },
      });
      if (count === 0) throw versionConflict();
      await recordServiceChange(tx, actor, {
        action: 'service.ticket.update',
        event: 'service.ticket.updated',
        entityType: 'svc_ticket',
        entityId: ticket.id,
        changes: updateAudit(ticket, input, links),
        payload: { ...ticketPayload(ticket), priority: input.priority },
      });
    });
  }

  /** Si cambió la prioridad, el reloj sigue con el acuerdo de la nueva. */
  private async clockFor(
    tx: TenantTransaction,
    actor: ServiceActor,
    ticket: SvcTicket & { readonly slaPolicy: Awaited<ReturnType<typeof policyFor>> },
    priority: TicketPriority,
  ) {
    if (priority === ticket.priority) return {};
    const next = await policyFor(tx, actor, priority);
    return reprioritizedClock(tx, ticket.slaPolicy, next, ticket, actor.at);
  }
}

import { Inject, Injectable } from '@nestjs/common';
import type { TicketMessage, TicketMessageRequest } from '@arza/contracts';

import { hasUnconditionalPermission, type AppAbility } from '../../../platform/access/ability.js';
import { permissionDenied } from '../../../platform/access/permission-denied.js';
import type { Principal } from '../../../platform/access/principal.js';
import { CLOCK, type Clock } from '../../../platform/clock/clock.js';
import { DatabaseService } from '../../../platform/database/database.service.js';
import type { TenantTransaction } from '../../../platform/database/tenant-context.js';
import type { RequestMeta } from '../../../platform/http/request-meta.js';
import {
  peopleNames,
  personRef,
  recordServiceChange,
  serviceActorOf,
  statusInvalid,
  type ServiceActor,
} from './service-support.js';
import { addTicketNote, type NoteKind } from './ticket-notes.js';
import { findVisibleTicket, isAgent, isRequester, type TicketWithLinks } from './ticket-records.js';
import { resumeTicket } from './ticket-flow.js';

// La conversación del tiquete (B28): mensajes públicos, que el cliente verá en el portal (B30), y
// notas internas que solo ve el equipo. No se editan ni se borran. El primer mensaje público del
// equipo es la primera respuesta (decisión 6). Lo que respondió el cliente, por correo o teléfono,
// lo registra quien atiende; si el tiquete estaba en espera del cliente, el reloj se reanuda
// (decisión 8). Quien pidió el tiquete escribe como el cliente.

/** Ve las notas internas quien ve todos los tiquetes; quien pidió el suyo, no. */
function seesInternal(ability: AppAbility): boolean {
  return hasUnconditionalPermission(ability, 'service.ticket.read');
}

/** Qué clase de mensaje puede escribir la persona; null si ninguno. */
function messageKind(
  ability: AppAbility,
  ticket: TicketWithLinks,
  userId: string,
  input: TicketMessageRequest,
): Required<NoteKind> | null {
  if (isAgent(ability)) return { internal: input.is_internal, fromClient: input.from_client };
  if (isRequester(ticket, userId)) return { internal: false, fromClient: true };
  return null;
}

@Injectable()
export class TicketMessagesUseCase {
  constructor(
    @Inject(DatabaseService) private readonly database: DatabaseService,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  async list(
    principal: Principal,
    ability: AppAbility,
    ticketId: string,
  ): Promise<TicketMessage[]> {
    return this.database.withTenant(principal, async (tx) => {
      await findVisibleTicket(tx, ability, ticketId);
      const messages = await tx.svcTicketMessage.findMany({
        where: {
          ticketId,
          deletedAt: null,
          ...(seesInternal(ability) ? {} : { isInternal: false }),
        },
        orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
      });
      const names = await peopleNames(
        tx,
        messages.map((message) => message.authorId),
      );
      return messages.map((message) => ({
        id: message.id,
        author: personRef(names, message.authorId),
        body: message.body,
        is_internal: message.isInternal,
        from_client: message.fromClient,
        created_at: message.createdAt.toISOString(),
      }));
    });
  }

  async add(
    principal: Principal,
    ability: AppAbility,
    ticketId: string,
    input: TicketMessageRequest,
    meta: RequestMeta,
  ): Promise<string> {
    const actor = serviceActorOf(principal, meta, this.clock.now());
    return this.database.withTenant(principal, async (tx) => {
      const ticket = await findVisibleTicket(tx, ability, ticketId);
      const kind = messageKind(ability, ticket, principal.userId, input);
      if (kind === null) throw permissionDenied();
      if (ticket.status === 'closed') {
        throw statusInvalid('El tiquete está cerrado. Registre uno nuevo si hace falta.');
      }
      const message = await addTicketNote(tx, actor, ticket.id, input.body, kind);
      await this.afterMessage(tx, actor, ticket, kind);
      await recordServiceChange(tx, actor, {
        action: 'service.ticket.message',
        event: 'service.ticket.messaged',
        entityType: 'svc_ticket_message',
        entityId: message.id,
        changes: { ticket: ticket.code, is_internal: kind.internal, from_client: kind.fromClient },
        payload: {
          ticket_id: ticket.id,
          code: ticket.code,
          is_internal: kind.internal,
          from_client: kind.fromClient,
          assignee_id: ticket.assigneeId,
        },
      });
      return message.id;
    });
  }

  /** La primera respuesta pública del equipo o la respuesta del cliente que reanuda el reloj. */
  private async afterMessage(
    tx: TenantTransaction,
    actor: ServiceActor,
    ticket: TicketWithLinks,
    kind: Required<NoteKind>,
  ): Promise<void> {
    if (kind.fromClient) {
      if (ticket.status === 'waiting_customer') {
        await resumeTicket(tx, actor, ticket, ticket.version);
      }
      return;
    }
    if (!kind.internal && ticket.firstResponseAt === null) {
      await tx.svcTicket.update({
        where: { id: ticket.id },
        data: { firstResponseAt: actor.at },
      });
    }
  }
}

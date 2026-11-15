import { Inject, Injectable } from '@nestjs/common';
import {
  MAX_TICKET_LEVEL,
  type AssignTicketRequest,
  type EscalateTicketRequest,
  type ReopenTicketRequest,
  type ResolveTicketRequest,
  type WaitTicketRequest,
} from '@arza/contracts';

import type { AppAbility } from '../../../platform/access/ability.js';
import { permissionDenied } from '../../../platform/access/permission-denied.js';
import type { Principal } from '../../../platform/access/principal.js';
import { CLOCK, type Clock } from '../../../platform/clock/clock.js';
import { DatabaseService } from '../../../platform/database/database.service.js';
import type { TenantTransaction } from '../../../platform/database/tenant-context.js';
import type { RequestMeta } from '../../../platform/http/request-meta.js';
import { nextLevel } from '../domain/ticket-clock.js';
import { minutesRun, pausedClock, resumedClock } from './sla-clock.js';
import {
  assigneeInvalid,
  levelInvalid,
  serviceActorOf,
  statusInvalid,
  type ServiceActor,
  type ServiceTarget,
} from './service-support.js';
import { inviteToSurvey } from './surveys.js';
import { addTicketNote } from './ticket-notes.js';
import { findVisibleTicket, isAgent, isRequester, ticketFor } from './ticket-records.js';
import {
  applyStep,
  assignablePeople,
  autoCloseAt,
  closeStep,
  resumeTicket,
} from './ticket-flow.js';

// El recorrido del tiquete (B28, ficha 17.9): asignar, escalar, empezar, poner en espera del cliente
// (el reloj se pausa), reanudar, resolver, reabrir y cerrar. Cada paso comprueba el estado con la
// misma tabla que usa la ficha (TICKET_ACTIONS) y deja su rastro en la auditoría y, cuando ayuda a
// entender el tiquete, una nota en la conversación.

@Injectable()
export class TicketStepsUseCase {
  constructor(
    @Inject(DatabaseService) private readonly database: DatabaseService,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  private run(
    principal: Principal,
    meta: RequestMeta,
    work: (tx: TenantTransaction, actor: ServiceActor) => Promise<void>,
  ): Promise<void> {
    const actor = serviceActorOf(principal, meta, this.clock.now());
    return this.database.withTenant(principal, (tx) => work(tx, actor));
  }

  private async assertAssignable(tx: TenantTransaction, at: Date, assigneeId: string) {
    if (!(await assignablePeople(tx, at)).includes(assigneeId)) throw assigneeInvalid();
  }

  async assign(
    principal: Principal,
    ability: AppAbility,
    target: ServiceTarget,
    input: AssignTicketRequest,
    meta: RequestMeta,
  ): Promise<void> {
    await this.run(principal, meta, async (tx, actor) => {
      const ticket = await ticketFor(tx, ability, target.id, 'service.ticket.assign');
      await this.assertAssignable(tx, actor.at, input.assignee_id);
      if (ticket.assigneeId === input.assignee_id) {
        throw statusInvalid('El tiquete ya está asignado a esa persona.');
      }
      await applyStep(tx, actor, ticket, target.version, {
        action: 'assign',
        data: {
          assigneeId: input.assignee_id,
          ...(ticket.status === 'new' ? { status: 'assigned' } : {}),
        },
        changes: { assignee_id: [ticket.assigneeId, input.assignee_id] },
      });
    });
  }

  async escalate(
    principal: Principal,
    ability: AppAbility,
    target: ServiceTarget,
    input: EscalateTicketRequest,
    meta: RequestMeta,
  ): Promise<void> {
    await this.run(principal, meta, async (tx, actor) => {
      const ticket = await ticketFor(tx, ability, target.id, 'service.ticket.assign');
      const level = nextLevel(ticket.level, MAX_TICKET_LEVEL);
      if (level === null) throw levelInvalid();
      await this.assertAssignable(tx, actor.at, input.assignee_id);
      await applyStep(tx, actor, ticket, target.version, {
        action: 'escalate',
        data: {
          level,
          assigneeId: input.assignee_id,
          ...(ticket.status === 'new' ? { status: 'assigned' } : {}),
        },
        changes: {
          level: [ticket.level, level],
          assignee_id: [ticket.assigneeId, input.assignee_id],
          reason: input.reason,
        },
      });
      await addTicketNote(
        tx,
        actor,
        ticket.id,
        `Escalado al nivel ${String(level)}: ${input.reason}`,
      );
    });
  }

  async start(
    principal: Principal,
    ability: AppAbility,
    target: ServiceTarget,
    meta: RequestMeta,
  ): Promise<void> {
    await this.run(principal, meta, async (tx, actor) => {
      const ticket = await ticketFor(tx, ability, target.id, 'service.ticket.resolve');
      await applyStep(tx, actor, ticket, target.version, {
        action: 'start',
        data: { status: 'in_progress' },
      });
    });
  }

  async wait(
    principal: Principal,
    ability: AppAbility,
    target: ServiceTarget,
    input: WaitTicketRequest,
    meta: RequestMeta,
  ): Promise<void> {
    await this.run(principal, meta, async (tx, actor) => {
      const ticket = await ticketFor(tx, ability, target.id, 'service.ticket.resolve');
      const clock = await pausedClock(tx, ticket.slaPolicy, ticket, actor.at);
      await applyStep(tx, actor, ticket, target.version, {
        action: 'wait',
        data: {
          status: 'waiting_customer',
          ...clock,
          // Lo que se le pide al cliente es una respuesta del equipo (decisión 6).
          ...(input.note !== null && ticket.firstResponseAt === null
            ? { firstResponseAt: actor.at }
            : {}),
        },
        changes: { consumed_minutes: clock.slaConsumedMinutes },
      });
      if (input.note !== null) {
        await addTicketNote(tx, actor, ticket.id, input.note, { internal: false });
      }
    });
  }

  async resume(
    principal: Principal,
    ability: AppAbility,
    target: ServiceTarget,
    meta: RequestMeta,
  ): Promise<void> {
    await this.run(principal, meta, async (tx, actor) => {
      const ticket = await ticketFor(tx, ability, target.id, 'service.ticket.resolve');
      await resumeTicket(tx, actor, ticket, target.version);
    });
  }

  async resolve(
    principal: Principal,
    ability: AppAbility,
    target: ServiceTarget,
    input: ResolveTicketRequest,
    meta: RequestMeta,
  ): Promise<void> {
    await this.run(principal, meta, async (tx, actor) => {
      const ticket = await ticketFor(tx, ability, target.id, 'service.ticket.resolve');
      const run =
        ticket.slaResumedAt === null
          ? 0
          : await minutesRun(tx, ticket.slaPolicy, ticket.slaResumedAt, actor.at);
      await applyStep(tx, actor, ticket, target.version, {
        action: 'resolve',
        data: {
          status: 'resolved',
          resolvedAt: actor.at,
          resolution: input.resolution,
          autoCloseAt: await autoCloseAt(tx, actor.at),
          slaConsumedMinutes: ticket.slaConsumedMinutes + run,
          slaResumedAt: null,
          pausedAt: null,
          firstResponseAt: ticket.firstResponseAt ?? actor.at,
        },
        changes: { within_sla: ticket.breachedAt === null },
      });
      // Al resolver, quien lo pidió recibe la encuesta de satisfacción (B29, ficha 17.9).
      await inviteToSurvey(tx, actor, ticket);
    });
  }

  async reopen(
    principal: Principal,
    ability: AppAbility,
    target: ServiceTarget,
    input: ReopenTicketRequest,
    meta: RequestMeta,
  ): Promise<void> {
    await this.run(principal, meta, async (tx, actor) => {
      const ticket = await findVisibleTicket(tx, ability, target.id);
      if (!isAgent(ability) && !isRequester(ticket, principal.userId)) throw permissionDenied();
      const clock = await resumedClock(tx, ticket.slaPolicy, ticket, actor.at);
      await applyStep(tx, actor, ticket, target.version, {
        action: 'reopen',
        data: {
          status: 'in_progress',
          resolvedAt: null,
          resolution: null,
          autoCloseAt: null,
          ...clock,
        },
        changes: { reason: input.reason },
      });
      await addTicketNote(tx, actor, ticket.id, `Reabierto: ${input.reason}`, {
        internal: false,
        fromClient: isRequester(ticket, principal.userId),
      });
    });
  }

  async close(
    principal: Principal,
    ability: AppAbility,
    target: ServiceTarget,
    meta: RequestMeta,
  ): Promise<void> {
    await this.run(principal, meta, async (tx, actor) => {
      const ticket = await ticketFor(tx, ability, target.id, 'service.ticket.close');
      await applyStep(tx, actor, ticket, target.version, closeStep(actor.at));
    });
  }
}

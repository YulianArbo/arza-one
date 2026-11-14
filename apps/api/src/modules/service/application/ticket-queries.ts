import { Inject, Injectable } from '@nestjs/common';
import {
  CLOCK_RUNNING_STATUSES,
  OPEN_TICKET_STATUSES,
  type TicketDetail,
  type TicketListQuery,
  type TicketListResponse,
  type TicketOptions,
  type TicketView,
} from '@arza/contracts';

import type { Prisma } from '../../../generated/prisma/client.js';
import { hasUnconditionalPermission, type AppAbility } from '../../../platform/access/ability.js';
import type { Principal } from '../../../platform/access/principal.js';
import { CLOCK, type Clock } from '../../../platform/clock/clock.js';
import { DatabaseService } from '../../../platform/database/database.service.js';
import type { TenantTransaction } from '../../../platform/database/tenant-context.js';
import { commercialParties } from '../../party/index.js';
import { deliverableRefs, projectRefs } from '../../project/index.js';
import { peopleNames, personRef } from './service-support.js';
import { assignablePeople } from './ticket-flow.js';
import {
  findVisibleTicket,
  TICKET_LINKS,
  ticketAbilities,
  ticketDetail,
  ticketSummary,
  type TicketWithLinks,
} from './ticket-records.js';

// Bandeja y ficha del tiquete (B28, ficha 17.9). La bandeja ordena por el vencimiento más próximo:
// lo que vence primero, arriba.

/** Lo que la persona puede ver: todo, o lo que pidió, registró o tiene asignado. */
function visibleTickets(principal: Principal, ability: AppAbility): Prisma.SvcTicketWhereInput {
  if (hasUnconditionalPermission(ability, 'service.ticket.read')) return {};
  const me = principal.userId;
  return { OR: [{ requesterId: me }, { assigneeId: me }, { createdBy: me }] };
}

const RUNNING = { in: [...CLOCK_RUNNING_STATUSES] };

function viewFilter(view: TicketView, userId: string, now: Date): Prisma.SvcTicketWhereInput {
  const filters: Record<TicketView, Prisma.SvcTicketWhereInput> = {
    all: { status: { in: [...OPEN_TICKET_STATUSES] } },
    mine: { assigneeId: userId, status: { in: [...OPEN_TICKET_STATUSES] } },
    unassigned: { status: 'new' },
    at_risk: {
      status: RUNNING,
      breachedAt: null,
      resolutionDueAt: { gt: now },
      OR: [{ warnedAt: { not: null } }, { warnAt: { lte: now } }],
    },
    overdue: {
      status: RUNNING,
      OR: [{ breachedAt: { not: null } }, { resolutionDueAt: { lte: now } }],
    },
    waiting: { status: 'waiting_customer' },
    done: { status: { in: ['resolved', 'closed'] } },
  };
  return filters[view];
}

function searchOf(query: TicketListQuery): Prisma.SvcTicketWhereInput {
  const contains =
    query.q === undefined ? null : ({ contains: query.q, mode: 'insensitive' } as const);
  return {
    ...(query.priority === undefined ? {} : { priority: query.priority }),
    ...(contains === null ? {} : { OR: [{ code: contains }, { subject: contains }] }),
  };
}

async function partyNames(tx: TenantTransaction, tickets: readonly TicketWithLinks[]) {
  const ids = tickets.map((ticket) => ticket.partyId).filter((id): id is string => id !== null);
  const parties = await commercialParties(tx, ids);
  return new Map([...parties].map(([id, party]) => [id, party.name]));
}

function peopleOf(tickets: readonly TicketWithLinks[]) {
  return tickets.flatMap((ticket) => [ticket.assigneeId, ticket.requesterId, ticket.createdBy]);
}

async function detailLinks(tx: TenantTransaction, ticket: TicketWithLinks) {
  const projectId = ticket.projectId;
  const deliverableId = ticket.deliverableId;
  const project =
    projectId === null ? undefined : (await projectRefs(tx, [projectId])).get(projectId);
  const deliverable =
    deliverableId === null
      ? undefined
      : (await deliverableRefs(tx, [deliverableId])).get(deliverableId);
  return {
    project:
      project === undefined ? null : { id: project.id, code: project.code, name: project.name },
    deliverable: deliverable === undefined ? null : { id: deliverable.id, name: deliverable.name },
  };
}

@Injectable()
export class TicketQueries {
  constructor(
    @Inject(DatabaseService) private readonly database: DatabaseService,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  async list(
    principal: Principal,
    ability: AppAbility,
    query: TicketListQuery,
  ): Promise<TicketListResponse> {
    const now = this.clock.now();
    return this.database.withTenant(principal, async (tx) => {
      const rows = await tx.svcTicket.findMany({
        where: {
          deletedAt: null,
          AND: [
            visibleTickets(principal, ability),
            viewFilter(query.view, principal.userId, now),
            searchOf(query),
          ],
        },
        include: TICKET_LINKS,
        orderBy: [
          { resolutionDueAt: { sort: 'asc', nulls: 'last' } },
          { createdAt: 'desc' },
          { id: 'desc' },
        ],
        take: query.limit + 1,
        ...(query.cursor === undefined ? {} : { cursor: { id: query.cursor }, skip: 1 }),
      });
      const page = rows.slice(0, query.limit);
      const next = rows.length > query.limit ? (page.at(-1)?.id ?? null) : null;
      const names = await peopleNames(tx, peopleOf(page));
      const parties = await partyNames(tx, page);
      return {
        data: page.map((ticket) => ticketSummary(ticket, names, parties, now)),
        next_cursor: next,
      };
    });
  }

  async detail(principal: Principal, ability: AppAbility, id: string): Promise<TicketDetail> {
    const now = this.clock.now();
    return this.database.withTenant(principal, async (tx) => {
      const ticket = await findVisibleTicket(tx, ability, id);
      const names = await peopleNames(tx, peopleOf([ticket]));
      const summary = ticketSummary(ticket, names, await partyNames(tx, [ticket]), now);
      const can = ticketAbilities(ability, ticket, principal.userId);
      return ticketDetail(ticket, summary, names, await detailLinks(tx, ticket), can);
    });
  }

  async options(principal: Principal): Promise<TicketOptions> {
    const now = this.clock.now();
    return this.database.withTenant(principal, async (tx) => {
      const ids = await assignablePeople(tx, now);
      const names = await peopleNames(tx, ids);
      const people = ids.flatMap((personId) => {
        const ref = personRef(names, personId);
        return ref === null ? [] : [ref];
      });
      return { assignees: people.sort((a, b) => a.name.localeCompare(b.name, 'es')) };
    });
  }
}

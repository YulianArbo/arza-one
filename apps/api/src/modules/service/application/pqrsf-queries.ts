import { Inject, Injectable } from '@nestjs/common';
import type {
  PqrsfDetail,
  PqrsfListQuery,
  PqrsfListResponse,
  PqrsfOptions,
  PqrsfView,
} from '@arza/contracts';

import type { Prisma, SvcPqrsf } from '../../../generated/prisma/client.js';
import { hasUnconditionalPermission, type AppAbility } from '../../../platform/access/ability.js';
import type { Principal } from '../../../platform/access/principal.js';
import { CLOCK, type Clock } from '../../../platform/clock/clock.js';
import { DatabaseService } from '../../../platform/database/database.service.js';
import type { TenantTransaction } from '../../../platform/database/tenant-context.js';
import { bogotaToday, fromCalendarDate } from '../../core/index.js';
import { commercialParties } from '../../party/index.js';
import {
  findPqrsf,
  OPEN_STATUSES,
  peopleOfPqrsf,
  pqrsfAbilities,
  pqrsfDetail,
  pqrsfSummary,
} from './pqrsf-records.js';
import { peopleNames } from './service-support.js';
import { assigneeOptions } from './ticket-flow.js';

// Bandeja y ficha de las PQRSF (B29, ficha 17.9). La bandeja ordena por la fecha límite: lo que
// vence primero, arriba.

const OPEN = { in: [...OPEN_STATUSES] };

function viewFilter(view: PqrsfView, userId: string, now: Date): Prisma.SvcPqrsfWhereInput {
  const today = fromCalendarDate(bogotaToday(now));
  const filters: Record<PqrsfView, Prisma.SvcPqrsfWhereInput> = {
    open: { status: OPEN },
    mine: { status: OPEN, assigneeId: userId },
    unclassified: { status: 'filed' },
    pending_approval: { approval: 'pending' },
    at_risk: { status: OPEN, warnOn: { lte: today }, dueOn: { gte: today } },
    overdue: { status: OPEN, dueOn: { lt: today } },
    done: { status: { in: ['responded', 'closed'] } },
  };
  return filters[view];
}

function searchOf(query: PqrsfListQuery): Prisma.SvcPqrsfWhereInput {
  const contains =
    query.q === undefined ? null : ({ contains: query.q, mode: 'insensitive' } as const);
  return {
    ...(query.type === undefined ? {} : { type: query.type }),
    ...(contains === null
      ? {}
      : { OR: [{ code: contains }, { subject: contains }, { requesterName: contains }] }),
  };
}

async function partyNames(tx: TenantTransaction, rows: readonly SvcPqrsf[]) {
  const ids = rows.map((row) => row.partyId).filter((id): id is string => id !== null);
  const parties = await commercialParties(tx, ids);
  return new Map([...parties].map(([id, party]) => [id, party.name]));
}

@Injectable()
export class PqrsfQueries {
  constructor(
    @Inject(DatabaseService) private readonly database: DatabaseService,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  async list(
    principal: Principal,
    ability: AppAbility,
    query: PqrsfListQuery,
  ): Promise<PqrsfListResponse> {
    const now = this.clock.now();
    return this.database.withTenant(principal, async (tx) => {
      const rows = await tx.svcPqrsf.findMany({
        where: {
          deletedAt: null,
          AND: [viewFilter(query.view, principal.userId, now), searchOf(query)],
        },
        orderBy: [{ dueOn: 'asc' }, { receivedAt: 'asc' }, { id: 'asc' }],
        take: query.limit + 1,
        ...(query.cursor === undefined ? {} : { cursor: { id: query.cursor }, skip: 1 }),
      });
      const page = rows.slice(0, query.limit);
      const next = rows.length > query.limit ? (page.at(-1)?.id ?? null) : null;
      const names = await peopleNames(tx, page.flatMap(peopleOfPqrsf));
      const parties = await partyNames(tx, page);
      return {
        data: page.map((row) => pqrsfSummary(row, names, parties, now)),
        next_cursor: next,
        can_create: hasUnconditionalPermission(ability, 'service.pqrsf.classify'),
      };
    });
  }

  async detail(principal: Principal, ability: AppAbility, id: string): Promise<PqrsfDetail> {
    const now = this.clock.now();
    return this.database.withTenant(principal, async (tx) => {
      const pqrsf = await findPqrsf(tx, id);
      const names = await peopleNames(tx, peopleOfPqrsf(pqrsf));
      const summary = pqrsfSummary(pqrsf, names, await partyNames(tx, [pqrsf]), now);
      const can = pqrsfAbilities(ability, pqrsf, principal.userId);
      return pqrsfDetail(pqrsf, summary, names, can);
    });
  }

  async options(principal: Principal): Promise<PqrsfOptions> {
    const now = this.clock.now();
    return this.database.withTenant(principal, async (tx) => {
      return { assignees: await assigneeOptions(tx, now) };
    });
  }
}

import { Inject, Injectable } from '@nestjs/common';
import {
  OPEN_STAGES,
  type OpportunityDetail,
  type OpportunityListQuery,
  type OpportunityListResponse,
} from '@arza/contracts';

import type { Prisma } from '../../../generated/prisma/client.js';
import type { Principal } from '../../../platform/access/principal.js';
import { DatabaseService } from '../../../platform/database/database.service.js';
import type { TenantTransaction } from '../../../platform/database/tenant-context.js';
import { matchingPartyIds } from '../../party/index.js';
import { opportunityContext, opportunitySummaryView } from './crm-views.js';
import { findOpportunity } from './opportunity-records.js';

// Tablero y tabla del embudo, y ficha de la oportunidad (B22). Las abiertas se ordenan por fecha
// esperada de cierre, para ver primero lo que está por cerrarse; las cerradas, las más recientes.

const VIEW_STAGES: Readonly<Record<OpportunityListQuery['view'], readonly string[] | null>> = {
  open: OPEN_STAGES,
  closed: ['won', 'lost'],
  all: null,
};

async function listWhere(
  tx: TenantTransaction,
  query: OpportunityListQuery,
): Promise<Prisma.CrmOpportunityWhereInput> {
  const stages = VIEW_STAGES[query.view];
  const where: Prisma.CrmOpportunityWhereInput = {
    deletedAt: null,
    ...(stages === null ? {} : { stage: { in: [...stages] } }),
    ...(query.stage === undefined ? {} : { stage: query.stage }),
    ...(query.owner_id === undefined ? {} : { ownerId: query.owner_id }),
    ...(query.party_id === undefined ? {} : { partyId: query.party_id }),
  };
  if (query.q === undefined) return where;
  const partyIds = await matchingPartyIds(tx, query.q);
  const text: Prisma.CrmOpportunityWhereInput[] = [
    { code: { contains: query.q.toUpperCase() } },
    { title: { contains: query.q, mode: 'insensitive' } },
    { partyId: { in: partyIds } },
  ];
  return { ...where, OR: text };
}

function orderOf(query: OpportunityListQuery): Prisma.CrmOpportunityOrderByWithRelationInput[] {
  return query.view === 'open'
    ? [{ expectedClose: 'asc' }, { id: 'asc' }]
    : [{ closedAt: { sort: 'desc', nulls: 'last' } }, { id: 'asc' }];
}

@Injectable()
export class OpportunityQueries {
  constructor(@Inject(DatabaseService) private readonly database: DatabaseService) {}

  async list(principal: Principal, query: OpportunityListQuery): Promise<OpportunityListResponse> {
    return this.database.withTenant(principal, async (tx) => {
      const rows = await tx.crmOpportunity.findMany({
        where: await listWhere(tx, query),
        orderBy: orderOf(query),
        take: query.limit + 1,
        ...(query.cursor === undefined ? {} : { cursor: { id: query.cursor }, skip: 1 }),
      });
      const page = rows.slice(0, query.limit);
      const context = await opportunityContext(tx, page);
      return {
        data: page.map((row) => opportunitySummaryView(row, context)),
        next_cursor: rows.length > query.limit ? (page.at(-1)?.id ?? null) : null,
      };
    });
  }

  async detail(principal: Principal, id: string): Promise<OpportunityDetail> {
    return this.database.withTenant(principal, async (tx) => {
      const opportunity = await findOpportunity(tx, id);
      const [context, lead] = await Promise.all([
        opportunityContext(tx, [opportunity]),
        opportunity.leadId === null
          ? null
          : tx.crmLead.findFirst({ where: { id: opportunity.leadId } }),
      ]);
      return {
        ...opportunitySummaryView(opportunity, context),
        lead: lead === null ? null : { id: lead.id, code: lead.code },
        lost_note: opportunity.lostNote,
        created_at: opportunity.createdAt.toISOString(),
      };
    });
  }
}

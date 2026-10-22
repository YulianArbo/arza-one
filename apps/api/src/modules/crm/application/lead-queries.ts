import { Inject, Injectable } from '@nestjs/common';
import type { LeadDetail, LeadListQuery, LeadListResponse } from '@arza/contracts';

import type { Prisma } from '../../../generated/prisma/client.js';
import type { Principal } from '../../../platform/access/principal.js';
import { DatabaseService } from '../../../platform/database/database.service.js';
import type { TenantTransaction } from '../../../platform/database/tenant-context.js';
import { toCalendarDate } from '../../core/index.js';
import { matchingPartyIds } from '../../party/index.js';
import { consentsOfParty } from '../../privacy/index.js';
import { leadContext, leadSummaryView, optionOf } from './crm-views.js';
import { findLead } from './lead-records.js';

// Lista y ficha de los prospectos (B22). Los más recientes primero; el código de cada uno crece
// con el tiempo, igual que su identificador (UUID v7).

function textFilter(q: string): Prisma.CrmLeadWhereInput[] {
  return [
    { code: { contains: q.toUpperCase() } },
    { companyName: { contains: q, mode: 'insensitive' } },
  ];
}

async function listWhere(tx: TenantTransaction, query: LeadListQuery) {
  const where: Prisma.CrmLeadWhereInput = {
    deletedAt: null,
    ...(query.status === undefined ? {} : { status: query.status }),
    ...(query.owner_id === undefined ? {} : { ownerId: query.owner_id }),
    ...(query.campaign_id === undefined ? {} : { campaignId: query.campaign_id }),
    ...(query.cursor === undefined ? {} : { id: { lt: query.cursor } }),
  };
  if (query.q === undefined) return where;
  // El nombre de la persona vive en Terceros: se busca por su index.ts, no en sus tablas.
  const partyIds = await matchingPartyIds(tx, query.q);
  return { ...where, OR: [...textFilter(query.q), { partyId: { in: partyIds } }] };
}

@Injectable()
export class LeadQueries {
  constructor(@Inject(DatabaseService) private readonly database: DatabaseService) {}

  async list(principal: Principal, query: LeadListQuery): Promise<LeadListResponse> {
    return this.database.withTenant(principal, async (tx) => {
      const rows = await tx.crmLead.findMany({
        where: await listWhere(tx, query),
        orderBy: { id: 'desc' },
        take: query.limit + 1,
      });
      const page = rows.slice(0, query.limit);
      const context = await leadContext(tx, page);
      return {
        data: page.map((lead) => leadSummaryView(lead, context)),
        next_cursor: rows.length > query.limit ? (page.at(-1)?.id ?? null) : null,
      };
    });
  }

  async detail(principal: Principal, id: string): Promise<LeadDetail> {
    return this.database.withTenant(principal, async (tx) => {
      const lead = await findLead(tx, id);
      const [context, consents, opportunity] = await Promise.all([
        leadContext(tx, [lead]),
        consentsOfParty(tx, [lead.partyId]),
        tx.crmOpportunity.findFirst({ where: { leadId: lead.id, deletedAt: null } }),
      ]);
      const consent = consents.find((item) => item.id === lead.consentId);
      return {
        ...leadSummaryView(lead, context),
        need: lead.need,
        consent: {
          id: lead.consentId,
          granted_on: consent?.granted_on ?? toCalendarDate(lead.createdAt),
          purposes: consent?.purposes ?? [],
        },
        discard_reason:
          lead.discardReason === null ? null : optionOf(context.labels, lead.discardReason),
        discard_note: lead.discardNote,
        opportunity: opportunity === null ? null : { id: opportunity.id, code: opportunity.code },
        qualified_at: lead.qualifiedAt?.toISOString() ?? null,
        closed_at: lead.closedAt?.toISOString() ?? null,
      };
    });
  }
}

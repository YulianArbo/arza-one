import { Inject, Injectable } from '@nestjs/common';
import {
  campaignChannelSchema,
  type Campaign,
  type CampaignListResponse,
  type CampaignRequest,
} from '@arza/contracts';

import { Prisma, type CrmCampaign } from '../../../generated/prisma/client.js';
import type { Principal } from '../../../platform/access/principal.js';
import { changesBetween } from '../../../platform/audit/audit-recorder.js';
import { CLOCK, type Clock } from '../../../platform/clock/clock.js';
import { DatabaseService } from '../../../platform/database/database.service.js';
import { versionConflict } from '../../../platform/http/if-match.js';
import type { RequestMeta } from '../../../platform/http/request-meta.js';
import { fromCalendarDate, toCalendarDate } from '../../core/index.js';
import { moneyText } from '../domain/money.js';
import { campaignNameTaken, crmNotFound } from './crm-messages.js';
import { crmActorOf, recordCrmChange } from './crm-support.js';

// Campañas (B22): de dónde llegan los prospectos, con su canal, sus fechas y su presupuesto.

function columnsOf(input: CampaignRequest) {
  return {
    name: input.name,
    channel: input.channel,
    startsOn: fromCalendarDate(input.starts_on),
    endsOn: input.ends_on === null ? null : fromCalendarDate(input.ends_on),
    budget: input.budget,
  };
}

function auditOf(campaign: CrmCampaign) {
  return {
    name: campaign.name,
    channel: campaign.channel,
    starts_on: toCalendarDate(campaign.startsOn),
    ends_on: campaign.endsOn === null ? null : toCalendarDate(campaign.endsOn),
    budget: campaign.budget === null ? null : moneyText(campaign.budget.toString()),
  };
}

function view(campaign: CrmCampaign, leads: number): Campaign {
  const audit = auditOf(campaign);
  return {
    id: campaign.id,
    ...audit,
    channel: campaignChannelSchema.parse(campaign.channel),
    leads_count: leads,
    version: campaign.version,
  };
}

/** Dos campañas no se llaman igual: decide el índice único y se responde 409. */
function sameNameOnConflict(error: unknown): never {
  if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
    throw campaignNameTaken();
  }
  throw error;
}

@Injectable()
export class CampaignsUseCase {
  constructor(
    @Inject(DatabaseService) private readonly database: DatabaseService,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  /** Las campañas, las más recientes primero, con cuántos prospectos trajo cada una. */
  async list(principal: Principal): Promise<CampaignListResponse> {
    return this.database.withTenant(principal, async (tx) => {
      const [rows, counts] = await Promise.all([
        tx.crmCampaign.findMany({
          where: { deletedAt: null },
          orderBy: [{ startsOn: 'desc' }, { name: 'asc' }],
        }),
        tx.crmLead.groupBy({
          by: ['campaignId'],
          where: { deletedAt: null, campaignId: { not: null } },
          _count: { _all: true },
        }),
      ]);
      const leads = new Map(counts.map((row) => [row.campaignId, row._count._all]));
      return { data: rows.map((row) => view(row, leads.get(row.id) ?? 0)) };
    });
  }

  async create(principal: Principal, input: CampaignRequest, meta: RequestMeta): Promise<string> {
    const actor = crmActorOf(principal, meta, this.clock.now());
    return this.database.withTenant(principal, async (tx) => {
      const campaign = await tx.crmCampaign
        .create({ data: { tenantId: actor.tenantId, ...columnsOf(input) } })
        .catch(sameNameOnConflict);
      await recordCrmChange(tx, actor, {
        action: 'crm.campaign.create',
        event: 'crm.campaign.created',
        entityType: 'crm_campaign',
        entityId: campaign.id,
        changes: auditOf(campaign),
      });
      return campaign.id;
    });
  }

  async update(
    principal: Principal,
    target: { readonly id: string; readonly version: number },
    input: CampaignRequest,
    meta: RequestMeta,
  ): Promise<void> {
    const actor = crmActorOf(principal, meta, this.clock.now());
    await this.database.withTenant(principal, async (tx) => {
      const before = await tx.crmCampaign.findFirst({ where: { id: target.id, deletedAt: null } });
      if (before === null) throw crmNotFound('La campaña');
      const { count } = await tx.crmCampaign
        .updateMany({ where: { id: target.id, version: target.version }, data: columnsOf(input) })
        .catch(sameNameOnConflict);
      if (count === 0) throw versionConflict();
      const after = await tx.crmCampaign.findFirstOrThrow({ where: { id: target.id } });
      await recordCrmChange(tx, actor, {
        action: 'crm.campaign.update',
        event: 'crm.campaign.updated',
        entityType: 'crm_campaign',
        entityId: target.id,
        changes: changesBetween(auditOf(before), auditOf(after)),
      });
    });
  }
}

import {
  leadStatusSchema,
  opportunityStageSchema,
  type LeadSummary,
  type OpportunitySummary,
  type OptionRef,
} from '@arza/contracts';

import type { CrmLead, CrmOpportunity } from '../../../generated/prisma/client.js';
import type { TenantTransaction } from '../../../platform/database/tenant-context.js';
import { catalogLabels, toCalendarDate } from '../../core/index.js';
import { commercialParties, type CommercialParty } from '../../party/index.js';
import { moneyText, weightedValue } from '../domain/money.js';
import { peopleNames, personRef } from './crm-support.js';

// Del registro guardado a lo que ve la pantalla (B22): nombres de clientes y responsables y
// etiquetas de los catálogos, leídos de una vez para toda la página.

export const LEAD_SOURCES = 'crm_lead_sources';
export const LOST_REASONS = 'crm_lost_reasons';
export const DISCARD_REASONS = 'crm_discard_reasons';

export interface ViewContext {
  readonly parties: ReadonlyMap<string, CommercialParty>;
  readonly people: ReadonlyMap<string, string>;
  readonly labels: ReadonlyMap<string, string>;
  readonly campaigns: ReadonlyMap<string, string>;
}

export function optionOf(labels: ReadonlyMap<string, string>, code: string): OptionRef {
  return { code, label: labels.get(code) ?? code };
}

function partyRef(context: ViewContext, id: string) {
  return { id, name: context.parties.get(id)?.name ?? 'Tercero' };
}

async function campaignNames(
  tx: TenantTransaction,
  ids: readonly (string | null)[],
): Promise<Map<string, string>> {
  const present = ids.filter((id): id is string => id !== null);
  if (present.length === 0) return new Map();
  const rows = await tx.crmCampaign.findMany({ where: { id: { in: [...new Set(present)] } } });
  return new Map(rows.map((row) => [row.id, row.name]));
}

export async function leadContext(
  tx: TenantTransaction,
  leads: readonly CrmLead[],
): Promise<ViewContext> {
  const [parties, people, sources, discards, campaigns] = await Promise.all([
    commercialParties(
      tx,
      leads.map((lead) => lead.partyId),
    ),
    peopleNames(
      tx,
      leads.map((lead) => lead.ownerId),
    ),
    catalogLabels(tx, LEAD_SOURCES),
    catalogLabels(tx, DISCARD_REASONS),
    campaignNames(
      tx,
      leads.map((lead) => lead.campaignId),
    ),
  ]);
  return { parties, people, labels: new Map([...sources, ...discards]), campaigns };
}

export function leadSummaryView(lead: CrmLead, context: ViewContext): LeadSummary {
  const person = context.parties.get(lead.partyId);
  return {
    id: lead.id,
    code: lead.code,
    status: leadStatusSchema.parse(lead.status),
    person: partyRef(context, lead.partyId),
    email: person?.email ?? null,
    phone: person?.phone ?? null,
    company_name: lead.companyName,
    source: optionOf(context.labels, lead.source),
    campaign:
      lead.campaignId === null
        ? null
        : { id: lead.campaignId, name: context.campaigns.get(lead.campaignId) ?? 'Campaña' },
    owner: personRef(context.people, lead.ownerId),
    created_at: lead.createdAt.toISOString(),
    version: lead.version,
  };
}

export async function opportunityContext(
  tx: TenantTransaction,
  opportunities: readonly CrmOpportunity[],
): Promise<ViewContext> {
  const [parties, people, labels] = await Promise.all([
    commercialParties(
      tx,
      opportunities.map((opportunity) => opportunity.partyId),
    ),
    peopleNames(
      tx,
      opportunities.map((opportunity) => opportunity.ownerId),
    ),
    catalogLabels(tx, LOST_REASONS),
  ]);
  return { parties, people, labels, campaigns: new Map() };
}

export function opportunitySummaryView(
  opportunity: CrmOpportunity,
  context: ViewContext,
): OpportunitySummary {
  const value = opportunity.estimatedValue.toString();
  return {
    id: opportunity.id,
    code: opportunity.code,
    title: opportunity.title,
    party: partyRef(context, opportunity.partyId),
    stage: opportunityStageSchema.parse(opportunity.stage),
    estimated_value: moneyText(value),
    probability: opportunity.probability,
    weighted_value: weightedValue(value, opportunity.probability),
    expected_close: toCalendarDate(opportunity.expectedClose),
    owner: personRef(context.people, opportunity.ownerId),
    lost_reason:
      opportunity.lostReason === null ? null : optionOf(context.labels, opportunity.lostReason),
    closed_at: opportunity.closedAt?.toISOString() ?? null,
    version: opportunity.version,
  };
}

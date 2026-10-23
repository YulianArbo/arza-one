import { isOpenStage, opportunityStageSchema, type OpenStage } from '@arza/contracts';

import type { CrmOpportunity, Prisma } from '../../../generated/prisma/client.js';
import type { TenantTransaction } from '../../../platform/database/tenant-context.js';
import { versionConflict } from '../../../platform/http/if-match.js';
import { fromCalendarDate, nextBusinessCode } from '../../core/index.js';
import { commercialParties } from '../../party/index.js';
import { probabilityFor } from '../domain/crm-rules.js';
import { moneyText } from '../domain/money.js';
import { crmNotFound, partyInvalid, statusInvalid } from './crm-messages.js';
import { ownerFor, recordCrmChange, type CrmActor } from './crm-support.js';

// Lectura, creación y cambio de una oportunidad con su versión (B22), comunes a los casos de uso.

const OPPORTUNITY_SEQUENCE = 'crm.opportunity';
const OPPORTUNITIES = { name: 'Oportunidades del CRM', prefix: 'OPO', padding: 4 } as const;

export async function findOpportunity(tx: TenantTransaction, id: string): Promise<CrmOpportunity> {
  const opportunity = await tx.crmOpportunity.findFirst({ where: { id, deletedAt: null } });
  if (opportunity === null) throw crmNotFound('La oportunidad');
  return opportunity;
}

/** Una oportunidad ganada o perdida ya no cambia (ficha 17.6). */
export function assertOpen(opportunity: CrmOpportunity): void {
  if (!isOpenStage(opportunityStageSchema.parse(opportunity.stage))) {
    throw statusInvalid('La oportunidad ya está cerrada: ganada o perdida no cambia.');
  }
}

/** El cliente existe en Terceros y se puede usar en una oportunidad. */
export async function assertUsableParty(tx: TenantTransaction, partyId: string): Promise<void> {
  const party = (await commercialParties(tx, [partyId])).get(partyId);
  if (party?.isUsable !== true) throw partyInvalid();
}

export async function updateOpportunityVersioned(
  tx: TenantTransaction,
  target: { readonly id: string; readonly version: number },
  data: Prisma.CrmOpportunityUncheckedUpdateManyInput,
): Promise<void> {
  const { count } = await tx.crmOpportunity.updateMany({
    where: { id: target.id, version: target.version, deletedAt: null },
    data,
  });
  if (count === 0) throw versionConflict();
}

/** Lo que guarda la auditoría de la oportunidad. */
export function opportunityAudit(
  opportunity: CrmOpportunity,
): Record<string, string | number | null> {
  return {
    code: opportunity.code,
    title: opportunity.title,
    party_id: opportunity.partyId,
    stage: opportunity.stage,
    estimated_value: moneyText(opportunity.estimatedValue.toString()),
    probability: opportunity.probability,
    expected_close: opportunity.expectedClose.toISOString().slice(0, 10),
    owner_id: opportunity.ownerId,
  };
}

export interface NewOpportunity {
  readonly party_id: string;
  readonly title: string;
  readonly estimated_value: string;
  readonly expected_close: string;
  readonly owner_id: string | null;
  readonly stage: OpenStage;
  readonly probability: number | null;
  readonly leadId: string | null;
}

/** Abre la oportunidad con su código, en la etapa pedida. Devuelve su id. */
export async function openOpportunity(
  tx: TenantTransaction,
  actor: CrmActor,
  input: NewOpportunity,
): Promise<string> {
  await assertUsableParty(tx, input.party_id);
  const ownerId = await ownerFor(tx, actor, input.owner_id);
  const code = await nextBusinessCode(tx, OPPORTUNITY_SEQUENCE, actor.at, OPPORTUNITIES);
  const opportunity = await tx.crmOpportunity.create({
    data: {
      tenantId: actor.tenantId,
      code,
      partyId: input.party_id,
      leadId: input.leadId,
      title: input.title,
      stage: input.stage,
      estimatedValue: input.estimated_value,
      probability: probabilityFor(input.stage, input.probability),
      expectedClose: fromCalendarDate(input.expected_close),
      ownerId,
    },
  });
  await recordCrmChange(tx, actor, {
    action: 'crm.opportunity.create',
    event: 'crm.opportunity.created',
    entityType: 'crm_opportunity',
    entityId: opportunity.id,
    changes: { ...opportunityAudit(opportunity), lead_id: input.leadId },
    payload: { code, party_id: input.party_id, lead_id: input.leadId },
  });
  return opportunity.id;
}

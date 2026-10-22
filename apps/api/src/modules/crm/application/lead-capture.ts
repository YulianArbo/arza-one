import type { CreateLeadRequest } from '@arza/contracts';

import type { CrmLead } from '../../../generated/prisma/client.js';
import type { Principal } from '../../../platform/access/principal.js';
import type { TenantTransaction } from '../../../platform/database/tenant-context.js';
import { nextBusinessCode } from '../../core/index.js';
import { commercialParties, registerProspect } from '../../party/index.js';
import { grantConsent } from '../../privacy/index.js';
import { startWorkflow } from '../../wf/index.js';
import { LEAD_FLOW } from '../domain/crm-flows.js';
import { partyInvalid } from './crm-messages.js';
import {
  assertCampaign,
  assertCatalogCode,
  ownerFor,
  recordCrmChange,
  type CrmActor,
} from './crm-support.js';
import { LEAD_SOURCES } from './crm-views.js';
import { LEAD_SEQUENCE, LEADS, leadAudit } from './lead-records.js';

// Captura de un prospecto (B22, ficha 17.6): la persona queda como tercero «prospecto» con su
// autorización de tratamiento, el prospecto recibe su código y el rol Comercial la tarea
// «Contactar al prospecto». Todo en la misma transacción.

/** La persona registrada que se eligió, o una nueva. Devuelve su id y su nombre. */
async function personOf(
  tx: TenantTransaction,
  actor: CrmActor,
  input: CreateLeadRequest,
): Promise<{ readonly id: string; readonly name: string }> {
  if (input.party_id !== null) {
    const party = (await commercialParties(tx, [input.party_id])).get(input.party_id);
    if (party?.isUsable !== true || party.kind !== 'person') throw partyInvalid();
    return { id: party.id, name: party.name };
  }
  const person = input.person;
  if (person === null) throw partyInvalid();
  const id = await registerProspect(tx, actor, {
    firstName: person.first_name,
    lastName: person.last_name,
    email: person.email,
    phone: person.phone,
  });
  return { id, name: `${person.first_name} ${person.last_name}` };
}

async function assertLeadFields(tx: TenantTransaction, input: CreateLeadRequest): Promise<void> {
  await assertCatalogCode(tx, LEAD_SOURCES, input.source, 'El origen');
  await assertCampaign(tx, input.campaign_id);
}

interface LeadRow {
  readonly input: CreateLeadRequest;
  readonly partyId: string;
  readonly consentId: string;
  readonly ownerId: string | null;
}

async function createLead(tx: TenantTransaction, actor: CrmActor, row: LeadRow): Promise<CrmLead> {
  const code = await nextBusinessCode(tx, LEAD_SEQUENCE, actor.at, LEADS);
  return tx.crmLead.create({
    data: {
      tenantId: actor.tenantId,
      code,
      source: row.input.source,
      campaignId: row.input.campaign_id,
      partyId: row.partyId,
      companyName: row.input.company_name,
      need: row.input.need,
      consentId: row.consentId,
      ownerId: row.ownerId,
    },
  });
}

/** Registra el prospecto. `principal` es null cuando llega del sitio público (B41). */
export async function captureLead(
  tx: TenantTransaction,
  actor: CrmActor & { readonly principal: Principal | null },
  input: CreateLeadRequest,
): Promise<string> {
  await assertLeadFields(tx, input);
  const ownerId = await ownerFor(tx, actor, input.owner_id);
  const person = await personOf(tx, actor, input);
  const consentId = await grantConsent(tx, actor, {
    partyId: person.id,
    grant: input.consent,
    source: 'crm_lead',
  });
  const lead = await createLead(tx, actor, { input, partyId: person.id, consentId, ownerId });
  const instance = await startWorkflow(tx, actor, {
    key: LEAD_FLOW,
    entityType: LEAD_FLOW,
    entityId: lead.id,
    title: `Contactar a ${person.name} (${lead.code})`,
    facts: {},
  });
  await tx.crmLead.update({ where: { id: lead.id }, data: { workflowInstanceId: instance.id } });
  await recordCrmChange(tx, actor, {
    action: 'crm.lead.create',
    event: 'crm.lead.created',
    entityType: 'crm_lead',
    entityId: lead.id,
    changes: { ...leadAudit(lead), party_id: person.id, consent_id: consentId },
    payload: { code: lead.code, party_id: person.id },
  });
  return lead.id;
}

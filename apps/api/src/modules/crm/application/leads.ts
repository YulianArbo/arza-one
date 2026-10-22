import { Inject, Injectable } from '@nestjs/common';
import type {
  ConvertLeadRequest,
  CreateLeadRequest,
  DiscardLeadRequest,
  UpdateLeadRequest,
} from '@arza/contracts';

import { hasPermission, type AppAbility } from '../../../platform/access/ability.js';
import type { Principal } from '../../../platform/access/principal.js';
import { changesBetween } from '../../../platform/audit/audit-recorder.js';
import { CLOCK, type Clock } from '../../../platform/clock/clock.js';
import { DatabaseService } from '../../../platform/database/database.service.js';
import type { TenantTransaction } from '../../../platform/database/tenant-context.js';
import type { RequestMeta } from '../../../platform/http/request-meta.js';
import { catalogLabels } from '../../core/index.js';
import { requestTransition, taskActorOf } from '../../wf/index.js';
import { LEAD_FLOW_ACTIONS } from '../domain/crm-flows.js';
import {
  assertCampaign,
  assertCatalogCode,
  crmActorOf,
  ownerFor,
  recordCrmChange,
  type CrmActor,
  type CrmTarget,
} from './crm-support.js';
import { DISCARD_REASONS, LEAD_SOURCES } from './crm-views.js';
import { captureLead } from './lead-capture.js';
import { assertLeadStatus, findLead, leadAudit, updateLeadVersioned } from './lead-records.js';
import { openOpportunity } from './opportunity-records.js';

/** Quien pide el cambio: su sesión y sus permisos, para atender la tarea del prospecto. */
export interface LeadRequester {
  readonly principal: Principal;
  readonly ability: AppAbility;
  readonly meta: RequestMeta;
}

/** Prospectos del CRM (B22, ficha 17.6): registro, edición, calificación, descarte y conversión. */
@Injectable()
export class LeadsUseCase {
  constructor(
    @Inject(DatabaseService) private readonly database: DatabaseService,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  private actor(principal: Principal, meta: RequestMeta): CrmActor {
    return crmActorOf(principal, meta, this.clock.now());
  }

  async create(principal: Principal, input: CreateLeadRequest, meta: RequestMeta): Promise<string> {
    const actor = { ...this.actor(principal, meta), principal };
    return this.database.withTenant(principal, (tx) => captureLead(tx, actor, input));
  }

  async update(
    principal: Principal,
    target: CrmTarget,
    input: UpdateLeadRequest,
    meta: RequestMeta,
  ): Promise<void> {
    const actor = this.actor(principal, meta);
    await this.database.withTenant(principal, async (tx) => {
      const before = await findLead(tx, target.id);
      assertLeadStatus(before, ['new', 'qualified']);
      if (input.source !== before.source) {
        await assertCatalogCode(tx, LEAD_SOURCES, input.source, 'El origen');
      }
      if (input.campaign_id !== before.campaignId) await assertCampaign(tx, input.campaign_id);
      const ownerId = await ownerFor(tx, actor, input.owner_id);
      await updateLeadVersioned(tx, target, {
        companyName: input.company_name,
        need: input.need,
        source: input.source,
        campaignId: input.campaign_id,
        ownerId,
      });
      const after = await findLead(tx, target.id);
      await recordCrmChange(tx, actor, {
        action: 'crm.lead.update',
        event: 'crm.lead.updated',
        entityType: 'crm_lead',
        entityId: target.id,
        changes: changesBetween(leadAudit(before), leadAudit(after)),
      });
    });
  }

  async qualify(requester: LeadRequester, target: CrmTarget): Promise<void> {
    const actor = this.actor(requester.principal, requester.meta);
    await this.database.withTenant(requester.principal, async (tx) => {
      const lead = await findLead(tx, target.id);
      assertLeadStatus(lead, ['new']);
      await updateLeadVersioned(tx, target, { status: 'qualified', qualifiedAt: actor.at });
      await recordCrmChange(tx, actor, {
        action: 'crm.lead.qualify',
        event: 'crm.lead.qualified',
        entityType: 'crm_lead',
        entityId: lead.id,
        changes: { code: lead.code, status: ['new', 'qualified'] },
      });
      await closeContactTask(tx, actor, requester, lead.workflowInstanceId, {
        action: LEAD_FLOW_ACTIONS.qualify,
        comment: null,
      });
    });
  }

  async discard(
    requester: LeadRequester,
    target: CrmTarget,
    input: DiscardLeadRequest,
  ): Promise<void> {
    const actor = this.actor(requester.principal, requester.meta);
    await this.database.withTenant(requester.principal, async (tx) => {
      const lead = await findLead(tx, target.id);
      assertLeadStatus(lead, ['new', 'qualified']);
      await assertCatalogCode(tx, DISCARD_REASONS, input.reason, 'El motivo');
      await updateLeadVersioned(tx, target, {
        status: 'discarded',
        discardReason: input.reason,
        discardNote: input.note,
        closedAt: actor.at,
      });
      await recordCrmChange(tx, actor, {
        action: 'crm.lead.discard',
        event: 'crm.lead.discarded',
        entityType: 'crm_lead',
        entityId: lead.id,
        changes: { code: lead.code, status: [lead.status, 'discarded'], reason: input.reason },
      });
      if (lead.status !== 'new') return;
      const label = (await catalogLabels(tx, DISCARD_REASONS)).get(input.reason) ?? input.reason;
      const comment = input.note === null ? `Descartado: ${label}` : `${label}: ${input.note}`;
      await closeContactTask(tx, actor, requester, lead.workflowInstanceId, {
        action: LEAD_FLOW_ACTIONS.discard,
        comment,
      });
    });
  }

  async convert(
    principal: Principal,
    target: CrmTarget,
    input: ConvertLeadRequest,
    meta: RequestMeta,
  ): Promise<string> {
    const actor = this.actor(principal, meta);
    return this.database.withTenant(principal, async (tx) => {
      const lead = await findLead(tx, target.id);
      assertLeadStatus(lead, ['qualified']);
      const opportunity = await openOpportunity(tx, actor, {
        ...input,
        leadId: lead.id,
        stage: 'prospecting',
        probability: null,
      });
      await updateLeadVersioned(tx, target, { status: 'converted', closedAt: actor.at });
      await recordCrmChange(tx, actor, {
        action: 'crm.lead.convert',
        event: 'crm.lead.converted',
        entityType: 'crm_lead',
        entityId: lead.id,
        changes: {
          code: lead.code,
          status: ['qualified', 'converted'],
          opportunity_id: opportunity,
        },
        payload: { opportunity_id: opportunity },
      });
      return opportunity;
    });
  }
}

/**
 * Cierra la tarea «Contactar al prospecto» con la misma decisión. Un prospecto nuevo siempre la
 * tiene abierta: si se atiende desde Mis tareas, el prospecto deja de ser nuevo (lead-flow.ts).
 */
async function closeContactTask(
  tx: TenantTransaction,
  actor: CrmActor,
  requester: LeadRequester,
  instanceId: string | null,
  step: { readonly action: string; readonly comment: string | null },
): Promise<void> {
  if (instanceId === null) return;
  const taskActor = await taskActorOf(tx, requester.principal, requester.ability, actor.at);
  await requestTransition(tx, actor, {
    instanceId,
    action: step.action,
    comment: step.comment,
    facts: {},
    actor: taskActor,
    hasPermission: (code) => hasPermission(requester.ability, code),
  });
}

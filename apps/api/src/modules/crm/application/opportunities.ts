import { Inject, Injectable } from '@nestjs/common';
import type {
  CreateOpportunityRequest,
  LoseOpportunityRequest,
  MoveOpportunityRequest,
  UpdateOpportunityRequest,
} from '@arza/contracts';

import type { Principal } from '../../../platform/access/principal.js';
import { changesBetween } from '../../../platform/audit/audit-recorder.js';
import { CLOCK, type Clock } from '../../../platform/clock/clock.js';
import { DatabaseService } from '../../../platform/database/database.service.js';
import type { RequestMeta } from '../../../platform/http/request-meta.js';
import { fromCalendarDate } from '../../core/index.js';
import { makeCustomer } from '../../party/index.js';
import { probabilityFor } from '../domain/crm-rules.js';
import { documentRequired } from './crm-messages.js';
import {
  assertCatalogCode,
  crmActorOf,
  ownerFor,
  recordCrmChange,
  type CrmActor,
  type CrmTarget,
} from './crm-support.js';
import { LOST_REASONS } from './crm-views.js';
import {
  assertOpen,
  assertUsableParty,
  findOpportunity,
  openOpportunity,
  opportunityAudit,
  updateOpportunityVersioned,
} from './opportunity-records.js';

/** Embudo de oportunidades (B22, ficha 17.6): registro, edición, etapas, ganar y perder. */
@Injectable()
export class OpportunitiesUseCase {
  constructor(
    @Inject(DatabaseService) private readonly database: DatabaseService,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  private actor(principal: Principal, meta: RequestMeta): CrmActor {
    return crmActorOf(principal, meta, this.clock.now());
  }

  async create(
    principal: Principal,
    input: CreateOpportunityRequest,
    meta: RequestMeta,
  ): Promise<string> {
    const actor = this.actor(principal, meta);
    return this.database.withTenant(principal, (tx) =>
      openOpportunity(tx, actor, { ...input, leadId: null }),
    );
  }

  async update(
    principal: Principal,
    target: CrmTarget,
    input: UpdateOpportunityRequest,
    meta: RequestMeta,
  ): Promise<void> {
    const actor = this.actor(principal, meta);
    await this.database.withTenant(principal, async (tx) => {
      const before = await findOpportunity(tx, target.id);
      assertOpen(before);
      const ownerId = await ownerFor(tx, actor, input.owner_id);
      await updateOpportunityVersioned(tx, target, {
        title: input.title,
        estimatedValue: input.estimated_value,
        probability: input.probability,
        expectedClose: fromCalendarDate(input.expected_close),
        ownerId,
      });
      const after = await findOpportunity(tx, target.id);
      await recordCrmChange(tx, actor, {
        action: 'crm.opportunity.update',
        event: 'crm.opportunity.updated',
        entityType: 'crm_opportunity',
        entityId: target.id,
        changes: changesBetween(opportunityAudit(before), opportunityAudit(after)),
      });
    });
  }

  /** Avanza o retrocede entre las etapas abiertas del embudo. */
  async move(
    principal: Principal,
    target: CrmTarget,
    input: MoveOpportunityRequest,
    meta: RequestMeta,
  ): Promise<void> {
    const actor = this.actor(principal, meta);
    await this.database.withTenant(principal, async (tx) => {
      const before = await findOpportunity(tx, target.id);
      assertOpen(before);
      const probability = probabilityFor(input.stage, input.probability);
      await updateOpportunityVersioned(tx, target, { stage: input.stage, probability });
      await recordCrmChange(tx, actor, {
        action: 'crm.opportunity.stage',
        event: 'crm.opportunity.moved',
        entityType: 'crm_opportunity',
        entityId: target.id,
        changes: {
          code: before.code,
          stage: [before.stage, input.stage],
          probability: [before.probability, probability],
        },
        payload: { stage: input.stage },
      });
    });
  }

  /** Ganada: el cliente queda activo y con el papel de cliente; sin documento no se puede. */
  async win(principal: Principal, target: CrmTarget, meta: RequestMeta): Promise<void> {
    const actor = this.actor(principal, meta);
    await this.database.withTenant(principal, async (tx) => {
      const before = await findOpportunity(tx, target.id);
      assertOpen(before);
      await assertUsableParty(tx, before.partyId);
      if (!(await makeCustomer(tx, actor, before.partyId))) throw documentRequired();
      await updateOpportunityVersioned(tx, target, {
        stage: 'won',
        probability: 100,
        closedAt: actor.at,
      });
      await recordCrmChange(tx, actor, {
        action: 'crm.opportunity.win',
        event: 'crm.opportunity.won',
        entityType: 'crm_opportunity',
        entityId: target.id,
        changes: { code: before.code, stage: [before.stage, 'won'] },
        payload: { party_id: before.partyId },
      });
    });
  }

  /** Perdida, con su motivo (ficha 17.6). */
  async lose(
    principal: Principal,
    target: CrmTarget,
    input: LoseOpportunityRequest,
    meta: RequestMeta,
  ): Promise<void> {
    const actor = this.actor(principal, meta);
    await this.database.withTenant(principal, async (tx) => {
      const before = await findOpportunity(tx, target.id);
      assertOpen(before);
      await assertCatalogCode(tx, LOST_REASONS, input.reason, 'El motivo de pérdida');
      await updateOpportunityVersioned(tx, target, {
        stage: 'lost',
        probability: 0,
        lostReason: input.reason,
        lostNote: input.note,
        closedAt: actor.at,
      });
      await recordCrmChange(tx, actor, {
        action: 'crm.opportunity.lose',
        event: 'crm.opportunity.lost',
        entityType: 'crm_opportunity',
        entityId: target.id,
        changes: { code: before.code, stage: [before.stage, 'lost'], reason: input.reason },
        payload: { reason: input.reason },
      });
    });
  }
}

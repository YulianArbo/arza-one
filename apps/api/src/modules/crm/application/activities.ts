import { Inject, Injectable } from '@nestjs/common';
import type {
  CompleteCrmActivityRequest,
  CreateCrmActivityRequest,
  CrmActivityListQuery,
  CrmActivityListResponse,
  UpdateCrmActivityRequest,
} from '@arza/contracts';

import type { Prisma } from '../../../generated/prisma/client.js';
import type { AppAbility } from '../../../platform/access/ability.js';
import type { Principal } from '../../../platform/access/principal.js';
import { changesBetween } from '../../../platform/audit/audit-recorder.js';
import { CLOCK, type Clock } from '../../../platform/clock/clock.js';
import { DatabaseService } from '../../../platform/database/database.service.js';
import type { TenantTransaction } from '../../../platform/database/tenant-context.js';
import type { RequestMeta } from '../../../platform/http/request-meta.js';
import {
  activityViews,
  assertActivityAccess,
  assertPending,
  findActivity,
  kindOf,
  updateActivityVersioned,
  WITH_RECORD,
} from './activity-records.js';
import {
  crmActorOf,
  ownerFor,
  recordCrmChange,
  type CrmActor,
  type CrmTarget,
} from './crm-support.js';
import { assertLeadStatus, findLead } from './lead-records.js';
import { assertOpen, findOpportunity } from './opportunity-records.js';

/** Quien pide: su sesión, sus permisos y desde dónde. */
export interface ActivityRequester {
  readonly principal: Principal;
  readonly ability: AppAbility;
  readonly meta: RequestMeta;
}

function auditOf(activity: {
  type: string;
  subject: string;
  dueAt: Date;
  assigneeId: string | null;
}) {
  return {
    type: activity.type,
    subject: activity.subject,
    due_at: activity.dueAt.toISOString(),
    assignee_id: activity.assigneeId,
  };
}

/** Solo se agendan actividades de un prospecto o una oportunidad abiertos. */
async function assertOpenRecord(tx: TenantTransaction, input: CreateCrmActivityRequest) {
  if (input.lead_id !== null) {
    assertLeadStatus(await findLead(tx, input.lead_id), ['new', 'qualified']);
    return;
  }
  if (input.opportunity_id !== null) assertOpen(await findOpportunity(tx, input.opportunity_id));
}

function listWhere(principal: Principal, query: CrmActivityListQuery) {
  const view = { pending: { doneAt: null }, done: { doneAt: { not: null } }, all: {} }[query.view];
  return {
    deletedAt: null,
    ...view,
    ...(query.lead_id === undefined ? {} : { leadId: query.lead_id }),
    ...(query.opportunity_id === undefined ? {} : { opportunityId: query.opportunity_id }),
    ...(query.mine === 'true' ? { assigneeId: principal.userId } : {}),
  } satisfies Prisma.CrmActivityWhereInput;
}

/** Actividades y recordatorios del CRM (B22, ficha 17.6). */
@Injectable()
export class ActivitiesUseCase {
  constructor(
    @Inject(DatabaseService) private readonly database: DatabaseService,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  private actor(requester: ActivityRequester): CrmActor {
    return crmActorOf(requester.principal, requester.meta, this.clock.now());
  }

  /** Las de un registro, o la agenda de la persona; sin el permiso de ver ambos tipos, 403. */
  async list(
    principal: Principal,
    ability: AppAbility,
    query: CrmActivityListQuery,
  ): Promise<CrmActivityListResponse> {
    if (query.opportunity_id === undefined) assertActivityAccess(ability, 'lead', 'read');
    if (query.lead_id === undefined) assertActivityAccess(ability, 'opportunity', 'read');
    return this.database.withTenant(principal, async (tx) => {
      const rows = await tx.crmActivity.findMany({
        where: listWhere(principal, query),
        include: WITH_RECORD,
        orderBy: [{ dueAt: query.view === 'done' ? 'desc' : 'asc' }, { id: 'asc' }],
        take: query.limit + 1,
        ...(query.cursor === undefined ? {} : { cursor: { id: query.cursor }, skip: 1 }),
      });
      const page = rows.slice(0, query.limit);
      return {
        data: await activityViews(tx, page),
        next_cursor: rows.length > query.limit ? (page.at(-1)?.id ?? null) : null,
      };
    });
  }

  async create(requester: ActivityRequester, input: CreateCrmActivityRequest): Promise<string> {
    assertActivityAccess(requester.ability, kindOf({ leadId: input.lead_id }), 'update');
    const actor = this.actor(requester);
    return this.database.withTenant(requester.principal, async (tx) => {
      await assertOpenRecord(tx, input);
      const assigneeId = await ownerFor(tx, actor, input.assignee_id);
      const activity = await tx.crmActivity.create({
        data: {
          tenantId: actor.tenantId,
          leadId: input.lead_id,
          opportunityId: input.opportunity_id,
          type: input.type,
          subject: input.subject,
          notes: input.notes,
          dueAt: new Date(input.due_at),
          assigneeId,
        },
      });
      await recordCrmChange(tx, actor, {
        action: 'crm.activity.create',
        event: 'crm.activity.created',
        entityType: 'crm_activity',
        entityId: activity.id,
        changes: {
          ...auditOf(activity),
          lead_id: input.lead_id,
          opportunity_id: input.opportunity_id,
        },
      });
      return activity.id;
    });
  }

  async update(
    requester: ActivityRequester,
    target: CrmTarget,
    input: UpdateCrmActivityRequest,
  ): Promise<void> {
    const actor = this.actor(requester);
    await this.database.withTenant(requester.principal, async (tx) => {
      const before = await findActivity(tx, target.id);
      assertActivityAccess(requester.ability, kindOf(before), 'update');
      assertPending(before);
      const assigneeId = await ownerFor(tx, actor, input.assignee_id);
      const dueAt = new Date(input.due_at);
      // Con otra hora, el recordatorio se vuelve a enviar.
      const remindedAt = dueAt.getTime() === before.dueAt.getTime() ? before.remindedAt : null;
      await updateActivityVersioned(tx, target, {
        type: input.type,
        subject: input.subject,
        notes: input.notes,
        dueAt,
        assigneeId,
        remindedAt,
      });
      const after = await findActivity(tx, target.id);
      await recordCrmChange(tx, actor, {
        action: 'crm.activity.update',
        event: 'crm.activity.updated',
        entityType: 'crm_activity',
        entityId: target.id,
        changes: changesBetween(auditOf(before), auditOf(after)),
      });
    });
  }

  async complete(
    requester: ActivityRequester,
    target: CrmTarget,
    input: CompleteCrmActivityRequest,
  ): Promise<void> {
    const actor = this.actor(requester);
    await this.database.withTenant(requester.principal, async (tx) => {
      const before = await findActivity(tx, target.id);
      assertActivityAccess(requester.ability, kindOf(before), 'update');
      assertPending(before);
      await updateActivityVersioned(tx, target, { doneAt: actor.at, outcome: input.outcome });
      await recordCrmChange(tx, actor, {
        action: 'crm.activity.complete',
        event: 'crm.activity.completed',
        entityType: 'crm_activity',
        entityId: target.id,
        changes: { subject: before.subject, done_at: actor.at.toISOString() },
      });
    });
  }
}

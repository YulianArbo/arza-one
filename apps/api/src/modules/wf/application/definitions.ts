import { Inject, Injectable } from '@nestjs/common';
import {
  definitionProblems,
  type CreateDefinitionRequest,
  type DefinitionSummary,
  type DefinitionView,
  type StartTestInstanceRequest,
  type UpdateDefinitionRequest,
} from '@arza/contracts';
import { v7 as uuidv7 } from 'uuid';

import type { Principal } from '../../../platform/access/principal.js';
import { CLOCK, type Clock } from '../../../platform/clock/clock.js';
import { DatabaseService } from '../../../platform/database/database.service.js';
import type { TenantTransaction } from '../../../platform/database/tenant-context.js';
import { versionConflict } from '../../../platform/http/if-match.js';
import type { RequestMeta } from '../../../platform/http/request-meta.js';
import { existingRoleCodes } from '../../iam/index.js';
import {
  findFlow,
  lockFlowVersions,
  writeFlowParts,
  type FlowParts,
  type StoredFlow,
} from '../infrastructure/flow-store.js';
import { auditWf, contextOf, type WfContext } from './wf-context.js';
import {
  definitionInvalid,
  definitionKeyTaken,
  definitionNotDraft,
  definitionNotFound,
  draftExists,
  noPublishedVersion,
} from './wf-messages.js';
import { startWorkflow } from './workflow-engine.js';

// Definiciones de flujo (ficha 17.5, ADR-011): el editor guarda borradores; publicar crea la
// versión vigente; cambiar una publicada exige una versión nueva. Los trámites en curso terminan
// con la versión con la que iniciaron.

export function summaryOf(flow: StoredFlow): DefinitionSummary {
  return {
    id: flow.id,
    key: flow.key,
    name: flow.name,
    entity_type: flow.entityType,
    version: flow.versionNumber,
    status: flow.status,
    published_at: flow.publishedAt?.toISOString() ?? null,
    updated_at: flow.updatedAt.toISOString(),
  };
}

function viewOf(flow: StoredFlow): DefinitionView {
  return {
    ...summaryOf(flow),
    description: flow.description,
    states: [...flow.states],
    transitions: [...flow.transitions],
    row_version: flow.rowVersion,
    problems: definitionProblems(flow),
  };
}

/** Los roles que nombran los responsables y aprobadores deben existir en la empresa. */
async function assertRolesExist(tx: TenantTransaction, parts: FlowParts): Promise<void> {
  const participants = parts.states.flatMap((state) => [
    ...(state.assignee === null ? [] : [state.assignee]),
    ...(state.approval?.approvers ?? []),
  ]);
  const codes = participants.flatMap((p) => (p.type === 'role' ? [p.role] : []));
  const existing = await existingRoleCodes(tx, codes);
  const missing = [...new Set(codes.filter((code) => !existing.has(code)))];
  if (missing.length > 0) {
    throw definitionInvalid(missing.map((code) => `El rol «${code}» no existe.`));
  }
}

@Injectable()
export class DefinitionsUseCase {
  constructor(
    @Inject(DatabaseService) private readonly database: DatabaseService,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  async list(principal: Principal): Promise<DefinitionSummary[]> {
    return this.database.withTenant(principal, async (tx) => {
      const rows = await tx.workflowDefinition.findMany({
        where: { deletedAt: null },
        select: { id: true },
        orderBy: [{ name: 'asc' }, { versionNumber: 'desc' }],
      });
      const flows = await Promise.all(rows.map((row) => findFlow(tx, row.id)));
      return flows.flatMap((flow) => (flow === null ? [] : [summaryOf(flow)]));
    });
  }

  async get(principal: Principal, id: string): Promise<DefinitionView> {
    return viewOf(await this.database.withTenant(principal, (tx) => this.find(tx, id)));
  }

  async create(
    principal: Principal,
    input: CreateDefinitionRequest,
    meta: RequestMeta,
  ): Promise<string> {
    const context = contextOf(principal, meta, this.clock.now());
    return this.database.withTenant(principal, async (tx) => {
      await lockFlowVersions(tx, input.key);
      const taken = await tx.workflowDefinition.count({ where: { key: input.key } });
      if (taken > 0) throw definitionKeyTaken();
      await assertRolesExist(tx, input);
      const created = await tx.workflowDefinition.create({
        data: {
          tenantId: principal.tenantId,
          key: input.key,
          versionNumber: 1,
          name: input.name,
          description: input.description,
          entityType: input.entity_type,
        },
      });
      await this.saveParts(tx, context, created.id, input);
      await this.audit(tx, context, 'wf.definition.create', created.id, { key: input.key });
      return created.id;
    });
  }

  /** Edición completa de un borrador, con la versión del registro que vio el editor. */
  async update(
    principal: Principal,
    id: string,
    input: UpdateDefinitionRequest,
    meta: { readonly request: RequestMeta; readonly version: number },
  ): Promise<void> {
    const context = contextOf(principal, meta.request, this.clock.now());
    await this.database.withTenant(principal, async (tx) => {
      const flow = await this.find(tx, id);
      if (flow.status !== 'draft') throw definitionNotDraft();
      await assertRolesExist(tx, input);
      const { count } = await tx.workflowDefinition.updateMany({
        where: { id, version: meta.version, status: 'draft' },
        data: { name: input.name, description: input.description },
      });
      if (count === 0) throw versionConflict();
      await this.saveParts(tx, context, id, input);
      await this.audit(tx, context, 'wf.definition.update', id, {
        states: input.states.length,
        transitions: input.transitions.length,
      });
    });
  }

  /** Publica el borrador: pasa a ser la versión vigente y la anterior queda retirada. */
  async publish(
    principal: Principal,
    id: string,
    version: number,
    meta: RequestMeta,
  ): Promise<void> {
    const context = contextOf(principal, meta, this.clock.now());
    await this.database.withTenant(principal, async (tx) => {
      const flow = await this.find(tx, id);
      await lockFlowVersions(tx, flow.key);
      if (flow.status !== 'draft') throw definitionNotDraft();
      const problems = definitionProblems(flow);
      if (problems.length > 0) throw definitionInvalid(problems);
      await tx.workflowDefinition.updateMany({
        where: { key: flow.key, status: 'published' },
        data: { status: 'retired' },
      });
      const published = {
        status: 'published',
        publishedAt: context.at,
        publishedBy: principal.userId,
      };
      const { count } = await tx.workflowDefinition.updateMany({
        where: { id, version, status: 'draft' },
        data: published,
      });
      if (count === 0) throw versionConflict();
      await this.audit(tx, context, 'wf.definition.publish', id, {
        key: flow.key,
        version: flow.versionNumber,
      });
    });
  }

  /** Copia una versión publicada o retirada en un borrador nuevo, con el número siguiente. */
  async newVersion(principal: Principal, id: string, meta: RequestMeta): Promise<string> {
    const context = contextOf(principal, meta, this.clock.now());
    return this.database.withTenant(principal, async (tx) => {
      const source = await this.find(tx, id);
      await lockFlowVersions(tx, source.key);
      const versions = await tx.workflowDefinition.findMany({
        where: { key: source.key },
        select: { versionNumber: true, status: true },
      });
      if (versions.some((row) => row.status === 'draft')) throw draftExists();
      const next = Math.max(...versions.map((row) => row.versionNumber)) + 1;
      const created = await tx.workflowDefinition.create({
        data: {
          tenantId: principal.tenantId,
          key: source.key,
          versionNumber: next,
          name: source.name,
          description: source.description,
          entityType: source.entityType,
        },
      });
      await this.saveParts(tx, context, created.id, source);
      await this.audit(tx, context, 'wf.definition.new_version', created.id, {
        key: source.key,
        version: next,
        from_version: source.versionNumber,
      });
      return created.id;
    });
  }

  /** Trámite de prueba con la versión publicada, para ensayar el flujo (B15). */
  async startTest(
    principal: Principal,
    id: string,
    input: StartTestInstanceRequest,
    meta: RequestMeta,
  ): Promise<string> {
    const context = contextOf(principal, meta, this.clock.now());
    return this.database.withTenant(principal, async (tx) => {
      const flow = await this.find(tx, id);
      if (flow.status !== 'published') throw noPublishedVersion();
      const instance = await startWorkflow(tx, context, {
        key: flow.key,
        entityType: flow.entityType,
        entityId: uuidv7(),
        title: input.title,
        facts: input.facts ?? {},
      });
      return instance.id;
    });
  }

  private async find(tx: TenantTransaction, id: string): Promise<StoredFlow> {
    const flow = await findFlow(tx, id);
    if (flow === null) throw definitionNotFound();
    return flow;
  }

  private async saveParts(
    tx: TenantTransaction,
    context: WfContext,
    id: string,
    parts: FlowParts,
  ): Promise<void> {
    await writeFlowParts(
      tx,
      { tenantId: context.tenantId, definitionId: id, now: context.at },
      parts,
    );
  }

  private async audit(
    tx: TenantTransaction,
    context: WfContext,
    action: string,
    id: string,
    changes: Record<string, string | number>,
  ): Promise<void> {
    await auditWf(tx, context, { action, entityType: 'wf_definition', entityId: id, changes });
  }
}

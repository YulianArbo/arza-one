import { Inject, Injectable } from '@nestjs/common';
import type { ContextItem, SaveContextItem, SaveStakeholder, Stakeholder } from '@arza/contracts';

import type { QmsContextItem, QmsStakeholder } from '../../../generated/prisma/client.js';
import type { Principal } from '../../../platform/access/principal.js';
import { changesBetween } from '../../../platform/audit/audit-recorder.js';
import { CLOCK, type Clock } from '../../../platform/clock/clock.js';
import { DatabaseService } from '../../../platform/database/database.service.js';
import { versionConflict } from '../../../platform/http/if-match.js';
import type { RequestMeta } from '../../../platform/http/request-meta.js';
import { auditQms, qmsActorOf, qmsNotFound, type Target } from './qms-support.js';

// Contexto DOFA-PESTEL (FT-DG-001) y partes interesadas (FT-DG-002) (B38, ficha 17.15).

function contextView(row: QmsContextItem): ContextItem {
  return {
    id: row.id,
    kind: row.kind as ContextItem['kind'],
    pestel_factor: row.pestelFactor as ContextItem['pestel_factor'],
    description: row.description,
    impact: row.impact as ContextItem['impact'],
    year: row.year,
    version: row.version,
  };
}

function contextData(input: SaveContextItem) {
  return {
    kind: input.kind,
    pestelFactor: input.pestel_factor,
    description: input.description,
    impact: input.impact,
    year: input.year,
  };
}

function stakeholderView(row: QmsStakeholder): Stakeholder {
  return {
    id: row.id,
    name: row.name,
    stakeholder_type: row.stakeholderType as Stakeholder['stakeholder_type'],
    needs: row.needs,
    expectations: row.expectations,
    monitoring: row.monitoring,
    version: row.version,
  };
}

function stakeholderData(input: SaveStakeholder) {
  return {
    name: input.name,
    stakeholderType: input.stakeholder_type,
    needs: input.needs,
    expectations: input.expectations,
    monitoring: input.monitoring,
  };
}

const contextAudit = (row: { kind: string; impact: string; year: number }) => ({
  kind: row.kind,
  impact: row.impact,
  year: row.year,
});
const stakeholderAudit = (row: { name: string; stakeholderType: string }) => ({
  name: row.name,
  stakeholder_type: row.stakeholderType,
});

@Injectable()
export class OrganizationContext {
  constructor(
    @Inject(DatabaseService) private readonly database: DatabaseService,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  /** La matriz DOFA-PESTEL de un año (por omisión, todas). */
  async listContext(principal: Principal, year: number | undefined): Promise<ContextItem[]> {
    return this.database.withTenant(principal, async (tx) => {
      const rows = await tx.qmsContextItem.findMany({
        where: { deletedAt: null, ...(year === undefined ? {} : { year }) },
        orderBy: [{ year: 'desc' }, { kind: 'asc' }, { id: 'asc' }],
        take: 500,
      });
      return rows.map(contextView);
    });
  }

  async createContext(
    principal: Principal,
    meta: RequestMeta,
    input: SaveContextItem,
  ): Promise<string> {
    const actor = qmsActorOf(principal, this.clock.now(), meta);
    return this.database.withTenant(principal, async (tx) => {
      const row = await tx.qmsContextItem.create({
        data: { tenantId: actor.tenantId, ...contextData(input) },
      });
      await auditQms(tx, actor, {
        action: 'qms.context.create',
        entityType: 'qms_context_item',
        entityId: row.id,
        changes: contextAudit(row),
      });
      return row.id;
    });
  }

  async updateContext(
    principal: Principal,
    meta: RequestMeta,
    target: Target,
    input: SaveContextItem,
  ): Promise<void> {
    const actor = qmsActorOf(principal, this.clock.now(), meta);
    await this.database.withTenant(principal, async (tx) => {
      const row = await tx.qmsContextItem.findFirst({ where: { id: target.id, deletedAt: null } });
      if (row === null) throw qmsNotFound('El factor de contexto no existe.');
      const data = contextData(input);
      const updated = await tx.qmsContextItem.updateMany({
        where: { id: row.id, version: target.version },
        data,
      });
      if (updated.count !== 1) throw versionConflict();
      await auditQms(tx, actor, {
        action: 'qms.context.update',
        entityType: 'qms_context_item',
        entityId: row.id,
        changes: changesBetween(contextAudit(row), contextAudit(data)),
      });
    });
  }

  async listStakeholders(principal: Principal): Promise<Stakeholder[]> {
    return this.database.withTenant(principal, async (tx) => {
      const rows = await tx.qmsStakeholder.findMany({
        where: { deletedAt: null },
        orderBy: [{ stakeholderType: 'asc' }, { name: 'asc' }],
        take: 500,
      });
      return rows.map(stakeholderView);
    });
  }

  async createStakeholder(
    principal: Principal,
    meta: RequestMeta,
    input: SaveStakeholder,
  ): Promise<string> {
    const actor = qmsActorOf(principal, this.clock.now(), meta);
    return this.database.withTenant(principal, async (tx) => {
      const row = await tx.qmsStakeholder.create({
        data: { tenantId: actor.tenantId, ...stakeholderData(input) },
      });
      await auditQms(tx, actor, {
        action: 'qms.stakeholder.create',
        entityType: 'qms_stakeholder',
        entityId: row.id,
        changes: stakeholderAudit(row),
      });
      return row.id;
    });
  }

  async updateStakeholder(
    principal: Principal,
    meta: RequestMeta,
    target: Target,
    input: SaveStakeholder,
  ): Promise<void> {
    const actor = qmsActorOf(principal, this.clock.now(), meta);
    await this.database.withTenant(principal, async (tx) => {
      const row = await tx.qmsStakeholder.findFirst({ where: { id: target.id, deletedAt: null } });
      if (row === null) throw qmsNotFound('La parte interesada no existe.');
      const data = stakeholderData(input);
      const updated = await tx.qmsStakeholder.updateMany({
        where: { id: row.id, version: target.version },
        data,
      });
      if (updated.count !== 1) throw versionConflict();
      await auditQms(tx, actor, {
        action: 'qms.stakeholder.update',
        entityType: 'qms_stakeholder',
        entityId: row.id,
        changes: changesBetween(stakeholderAudit(row), stakeholderAudit(data)),
      });
    });
  }
}

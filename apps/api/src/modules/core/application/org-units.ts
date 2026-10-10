import { Inject, Injectable } from '@nestjs/common';
import type {
  CreateOrgUnitRequest,
  OrgUnit as OrgUnitView,
  UpdateOrgUnitRequest,
} from '@arza/contracts';

import type { OrgUnit } from '../../../generated/prisma/client.js';
import type { Principal } from '../../../platform/access/principal.js';
import { changesBetween } from '../../../platform/audit/audit-recorder.js';
import { CLOCK, type Clock } from '../../../platform/clock/clock.js';
import { DatabaseService } from '../../../platform/database/database.service.js';
import type { TenantTransaction } from '../../../platform/database/tenant-context.js';
import { versionConflict } from '../../../platform/http/if-match.js';
import type { RequestMeta } from '../../../platform/http/request-meta.js';
import { createsCycle } from '../domain/hierarchy.js';
import { auditCore, type CoreActor } from './core-audit.js';
import { codeTaken, hierarchyCycle, recordInUse, recordNotFound } from './core-messages.js';
import type { Versioned } from './records.js';

function unitView(unit: OrgUnit): OrgUnitView {
  return {
    id: unit.id,
    parent_id: unit.parentId,
    code: unit.code,
    name: unit.name,
    kind: unit.kind === 'area' ? 'area' : 'process',
    owner_position_id: unit.ownerPositionId,
    is_active: unit.isActive,
    version: unit.version,
  };
}

function unitAudit(unit: OrgUnit) {
  return {
    parent_id: unit.parentId,
    code: unit.code,
    name: unit.name,
    kind: unit.kind,
    owner_position_id: unit.ownerPositionId,
    is_active: unit.isActive,
  };
}

async function findUnit(tx: TenantTransaction, id: string): Promise<OrgUnit> {
  const unit = await tx.orgUnit.findFirst({ where: { id, deletedAt: null } });
  if (unit === null) throw recordNotFound('El proceso o área');
  return unit;
}

/** El código es único entre todos, también los eliminados: un código usado no se recicla. */
async function assertCodeFree(tx: TenantTransaction, code: string): Promise<void> {
  if ((await tx.orgUnit.count({ where: { code } })) > 0) throw codeTaken();
}

async function assertReferences(
  tx: TenantTransaction,
  input: { readonly parent_id: string | null; readonly owner_position_id: string | null },
): Promise<void> {
  if (input.parent_id !== null) await findUnit(tx, input.parent_id);
  if (input.owner_position_id === null) return;
  const owner = await tx.position.count({
    where: { id: input.owner_position_id, deletedAt: null },
  });
  if (owner === 0) throw recordNotFound('El cargo líder');
}

async function assertNoCycle(tx: TenantTransaction, id: string, parentId: string | null) {
  const units = await tx.orgUnit.findMany({
    where: { deletedAt: null },
    select: { id: true, parentId: true },
  });
  const parents = new Map(units.map((unit) => [unit.id, unit.parentId]));
  if (createsCycle(id, parentId, parents)) throw hierarchyCycle();
}

/** Lo que impide eliminar un proceso o área, o null si nada lo usa (ficha 17.1). */
async function unitUsage(tx: TenantTransaction, id: string): Promise<string | null> {
  const live = { deletedAt: null };
  if ((await tx.orgUnit.count({ where: { parentId: id, ...live } })) > 0)
    return 'tiene procesos o áreas que dependen de él';
  if ((await tx.position.count({ where: { orgUnitId: id, ...live } })) > 0) return 'tiene cargos';
  if ((await tx.costCenter.count({ where: { orgUnitId: id, ...live } })) > 0)
    return 'tiene centros de costo';
  return null;
}

/** Procesos y áreas del mapa de procesos, con su jerarquía (ficha 17.1). */
@Injectable()
export class OrgUnitsUseCase {
  constructor(
    @Inject(DatabaseService) private readonly database: DatabaseService,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  private actor(principal: Principal, meta: RequestMeta): CoreActor {
    return { context: principal, meta, at: this.clock.now() };
  }

  async list(principal: Principal): Promise<OrgUnitView[]> {
    const units = await this.database.withTenant(principal, (tx) =>
      tx.orgUnit.findMany({ where: { deletedAt: null }, orderBy: { code: 'asc' } }),
    );
    return units.map(unitView);
  }

  async create(
    principal: Principal,
    input: CreateOrgUnitRequest,
    meta: RequestMeta,
  ): Promise<string> {
    const actor = this.actor(principal, meta);
    return this.database.withTenant(principal, async (tx) => {
      await assertCodeFree(tx, input.code);
      await assertReferences(tx, input);
      const unit = await tx.orgUnit.create({
        data: {
          tenantId: principal.tenantId,
          parentId: input.parent_id,
          code: input.code,
          name: input.name,
          kind: input.kind,
          ownerPositionId: input.owner_position_id,
        },
      });
      await auditCore(tx, actor, {
        action: 'core.org_unit.create',
        entityType: 'org_unit',
        entityId: unit.id,
        changes: unitAudit(unit),
      });
      return unit.id;
    });
  }

  async update(
    principal: Principal,
    target: Versioned,
    input: UpdateOrgUnitRequest,
    meta: RequestMeta,
  ): Promise<OrgUnitView> {
    const actor = this.actor(principal, meta);
    return this.database.withTenant(principal, async (tx) => {
      const before = await findUnit(tx, target.id);
      if (input.code !== before.code) await assertCodeFree(tx, input.code);
      await assertReferences(tx, input);
      await assertNoCycle(tx, before.id, input.parent_id);
      const { count } = await tx.orgUnit.updateMany({
        where: { id: before.id, version: target.version },
        data: {
          parentId: input.parent_id,
          code: input.code,
          name: input.name,
          kind: input.kind,
          ownerPositionId: input.owner_position_id,
          isActive: input.is_active,
        },
      });
      if (count === 0) throw versionConflict();
      const unit = await findUnit(tx, before.id);
      await auditCore(tx, actor, {
        action: 'core.org_unit.update',
        entityType: 'org_unit',
        entityId: unit.id,
        changes: changesBetween(unitAudit(before), unitAudit(unit)),
      });
      return unitView(unit);
    });
  }

  async remove(principal: Principal, target: Versioned, meta: RequestMeta): Promise<void> {
    const actor = this.actor(principal, meta);
    await this.database.withTenant(principal, async (tx) => {
      const unit = await findUnit(tx, target.id);
      const usage = await unitUsage(tx, unit.id);
      if (usage !== null) throw recordInUse(usage);
      const { count } = await tx.orgUnit.updateMany({
        where: { id: unit.id, version: target.version },
        data: { deletedAt: actor.at },
      });
      if (count === 0) throw versionConflict();
      await auditCore(tx, actor, {
        action: 'core.org_unit.delete',
        entityType: 'org_unit',
        entityId: unit.id,
        changes: { code: unit.code, name: unit.name },
      });
    });
  }
}

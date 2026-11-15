import { Inject, Injectable } from '@nestjs/common';
import type {
  CostCenter as CostCenterView,
  CreateCostCenterRequest,
  UpdateCostCenterRequest,
} from '@arza/contracts';

import type { CostCenter } from '../../../generated/prisma/client.js';
import type { Principal } from '../../../platform/access/principal.js';
import { changesBetween } from '../../../platform/audit/audit-recorder.js';
import { CLOCK, type Clock } from '../../../platform/clock/clock.js';
import { DatabaseService } from '../../../platform/database/database.service.js';
import type { TenantTransaction } from '../../../platform/database/tenant-context.js';
import { versionConflict } from '../../../platform/http/if-match.js';
import type { RequestMeta } from '../../../platform/http/request-meta.js';
import { auditCore, type CoreActor } from './core-audit.js';
import { codeTaken, recordNotFound } from './core-messages.js';
import type { Versioned } from './records.js';

function costCenterView(center: CostCenter): CostCenterView {
  return {
    id: center.id,
    code: center.code,
    name: center.name,
    org_unit_id: center.orgUnitId,
    is_active: center.isActive,
    version: center.version,
  };
}

function costCenterAudit(center: CostCenter) {
  return {
    code: center.code,
    name: center.name,
    org_unit_id: center.orgUnitId,
    is_active: center.isActive,
  };
}

async function findCostCenter(tx: TenantTransaction, id: string): Promise<CostCenter> {
  const center = await tx.costCenter.findFirst({ where: { id, deletedAt: null } });
  if (center === null) throw recordNotFound('El centro de costo');
  return center;
}

async function assertValid(
  tx: TenantTransaction,
  input: { readonly code: string; readonly org_unit_id: string | null },
  currentCode: string | null,
): Promise<void> {
  if (
    input.code !== currentCode &&
    (await tx.costCenter.count({ where: { code: input.code } })) > 0
  )
    throw codeTaken();
  if (input.org_unit_id === null) return;
  const unit = await tx.orgUnit.count({ where: { id: input.org_unit_id, deletedAt: null } });
  if (unit === 0) throw recordNotFound('El proceso o área');
}

/**
 * Centros de costo (ficha 17.1). Todavía ningún módulo los usa; cuando finanzas y compras los
 * usen (F6), eliminarlos exigirá que no tengan movimientos.
 */
@Injectable()
export class CostCentersUseCase {
  constructor(
    @Inject(DatabaseService) private readonly database: DatabaseService,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  private actor(principal: Principal, meta: RequestMeta): CoreActor {
    return { context: principal, meta, at: this.clock.now() };
  }

  async list(principal: Principal): Promise<CostCenterView[]> {
    const centers = await this.database.withTenant(principal, (tx) =>
      tx.costCenter.findMany({ where: { deletedAt: null }, orderBy: { code: 'asc' } }),
    );
    return centers.map(costCenterView);
  }

  async create(
    principal: Principal,
    input: CreateCostCenterRequest,
    meta: RequestMeta,
  ): Promise<string> {
    const actor = this.actor(principal, meta);
    return this.database.withTenant(principal, async (tx) => {
      await assertValid(tx, input, null);
      const center = await tx.costCenter.create({
        data: {
          tenantId: principal.tenantId,
          code: input.code,
          name: input.name,
          orgUnitId: input.org_unit_id,
        },
      });
      await auditCore(tx, actor, {
        action: 'core.cost_center.create',
        entityType: 'cost_center',
        entityId: center.id,
        changes: costCenterAudit(center),
      });
      return center.id;
    });
  }

  async update(
    principal: Principal,
    target: Versioned,
    input: UpdateCostCenterRequest,
    meta: RequestMeta,
  ): Promise<CostCenterView> {
    const actor = this.actor(principal, meta);
    return this.database.withTenant(principal, async (tx) => {
      const before = await findCostCenter(tx, target.id);
      await assertValid(tx, input, before.code);
      const { count } = await tx.costCenter.updateMany({
        where: { id: before.id, version: target.version },
        data: {
          code: input.code,
          name: input.name,
          orgUnitId: input.org_unit_id,
          isActive: input.is_active,
        },
      });
      if (count === 0) throw versionConflict();
      const center = await findCostCenter(tx, before.id);
      await auditCore(tx, actor, {
        action: 'core.cost_center.update',
        entityType: 'cost_center',
        entityId: center.id,
        changes: changesBetween(costCenterAudit(before), costCenterAudit(center)),
      });
      return costCenterView(center);
    });
  }

  async remove(principal: Principal, target: Versioned, meta: RequestMeta): Promise<void> {
    const actor = this.actor(principal, meta);
    await this.database.withTenant(principal, async (tx) => {
      const center = await findCostCenter(tx, target.id);
      const { count } = await tx.costCenter.updateMany({
        where: { id: center.id, version: target.version },
        data: { deletedAt: actor.at },
      });
      if (count === 0) throw versionConflict();
      await auditCore(tx, actor, {
        action: 'core.cost_center.delete',
        entityType: 'cost_center',
        entityId: center.id,
        changes: { code: center.code, name: center.name },
      });
    });
  }
}

/** Centros de costo por identificador, también los inactivos que guardan los registros. */
export async function costCenterRefs(
  tx: TenantTransaction,
  ids: readonly string[],
): Promise<Map<string, { id: string; code: string; name: string; isActive: boolean }>> {
  if (ids.length === 0) return new Map();
  const centers = await tx.costCenter.findMany({
    where: { id: { in: [...new Set(ids)] }, deletedAt: null },
    select: { id: true, code: true, name: true, isActive: true },
  });
  return new Map(centers.map((center) => [center.id, center]));
}

/** Centros de costo activos, para elegir en un formulario. */
export async function activeCostCenters(
  tx: TenantTransaction,
): Promise<{ id: string; code: string; name: string }[]> {
  return tx.costCenter.findMany({
    where: { isActive: true, deletedAt: null },
    select: { id: true, code: true, name: true },
    orderBy: { code: 'asc' },
  });
}

import { Inject, Injectable } from '@nestjs/common';
import type {
  CreatePositionRequest,
  Position as PositionView,
  UpdatePositionRequest,
} from '@arza/contracts';

import type { Position } from '../../../generated/prisma/client.js';
import type { Principal } from '../../../platform/access/principal.js';
import { changesBetween } from '../../../platform/audit/audit-recorder.js';
import { CLOCK, type Clock } from '../../../platform/clock/clock.js';
import { DatabaseService } from '../../../platform/database/database.service.js';
import type { TenantTransaction } from '../../../platform/database/tenant-context.js';
import { versionConflict } from '../../../platform/http/if-match.js';
import type { RequestMeta } from '../../../platform/http/request-meta.js';
import { usersInPosition } from '../../iam/index.js';
import { createsCycle } from '../domain/hierarchy.js';
import { auditCore, type CoreActor } from './core-audit.js';
import { hierarchyCycle, recordInUse, recordNotFound } from './core-messages.js';
import type { Versioned } from './records.js';

function positionView(position: Position): PositionView {
  return {
    id: position.id,
    org_unit_id: position.orgUnitId,
    name: position.name,
    reports_to_id: position.reportsToId,
    is_active: position.isActive,
    version: position.version,
  };
}

function positionAudit(position: Position) {
  return {
    org_unit_id: position.orgUnitId,
    name: position.name,
    reports_to_id: position.reportsToId,
    is_active: position.isActive,
  };
}

async function findPosition(tx: TenantTransaction, id: string): Promise<Position> {
  const position = await tx.position.findFirst({ where: { id, deletedAt: null } });
  if (position === null) throw recordNotFound('El cargo');
  return position;
}

async function assertReferences(
  tx: TenantTransaction,
  input: { readonly org_unit_id: string; readonly reports_to_id: string | null },
): Promise<void> {
  const unit = await tx.orgUnit.count({ where: { id: input.org_unit_id, deletedAt: null } });
  if (unit === 0) throw recordNotFound('El proceso o área');
  if (input.reports_to_id !== null) await findPosition(tx, input.reports_to_id);
}

async function assertNoCycle(tx: TenantTransaction, id: string, reportsToId: string | null) {
  const positions = await tx.position.findMany({
    where: { deletedAt: null },
    select: { id: true, reportsToId: true },
  });
  const bosses = new Map(positions.map((position) => [position.id, position.reportsToId]));
  if (createsCycle(id, reportsToId, bosses)) throw hierarchyCycle();
}

/** Lo que impide eliminar un cargo, o null si nada lo usa (ficha 17.1). */
async function positionUsage(tx: TenantTransaction, id: string): Promise<string | null> {
  const live = { deletedAt: null };
  if ((await tx.position.count({ where: { reportsToId: id, ...live } })) > 0)
    return 'otros cargos le reportan';
  if ((await tx.orgUnit.count({ where: { ownerPositionId: id, ...live } })) > 0)
    return 'lidera procesos o áreas';
  if ((await usersInPosition(tx, id)) > 0) return 'hay personas con ese cargo';
  return null;
}

/** Cargos del organigrama DC-SGC-001 y a quién reporta cada uno (ficha 17.1). */
@Injectable()
export class PositionsUseCase {
  constructor(
    @Inject(DatabaseService) private readonly database: DatabaseService,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  private actor(principal: Principal, meta: RequestMeta): CoreActor {
    return { context: principal, meta, at: this.clock.now() };
  }

  async list(principal: Principal): Promise<PositionView[]> {
    const positions = await this.database.withTenant(principal, (tx) =>
      tx.position.findMany({ where: { deletedAt: null }, orderBy: { name: 'asc' } }),
    );
    return positions.map(positionView);
  }

  async create(
    principal: Principal,
    input: CreatePositionRequest,
    meta: RequestMeta,
  ): Promise<string> {
    const actor = this.actor(principal, meta);
    return this.database.withTenant(principal, async (tx) => {
      await assertReferences(tx, input);
      const position = await tx.position.create({
        data: {
          tenantId: principal.tenantId,
          orgUnitId: input.org_unit_id,
          name: input.name,
          reportsToId: input.reports_to_id,
        },
      });
      await auditCore(tx, actor, {
        action: 'core.position.create',
        entityType: 'position',
        entityId: position.id,
        changes: positionAudit(position),
      });
      return position.id;
    });
  }

  async update(
    principal: Principal,
    target: Versioned,
    input: UpdatePositionRequest,
    meta: RequestMeta,
  ): Promise<PositionView> {
    const actor = this.actor(principal, meta);
    return this.database.withTenant(principal, async (tx) => {
      const before = await findPosition(tx, target.id);
      await assertReferences(tx, input);
      await assertNoCycle(tx, before.id, input.reports_to_id);
      const { count } = await tx.position.updateMany({
        where: { id: before.id, version: target.version },
        data: {
          orgUnitId: input.org_unit_id,
          name: input.name,
          reportsToId: input.reports_to_id,
          isActive: input.is_active,
        },
      });
      if (count === 0) throw versionConflict();
      const position = await findPosition(tx, before.id);
      await auditCore(tx, actor, {
        action: 'core.position.update',
        entityType: 'position',
        entityId: position.id,
        changes: changesBetween(positionAudit(before), positionAudit(position)),
      });
      return positionView(position);
    });
  }

  async remove(principal: Principal, target: Versioned, meta: RequestMeta): Promise<void> {
    const actor = this.actor(principal, meta);
    await this.database.withTenant(principal, async (tx) => {
      const position = await findPosition(tx, target.id);
      const usage = await positionUsage(tx, position.id);
      if (usage !== null) throw recordInUse(usage);
      const { count } = await tx.position.updateMany({
        where: { id: position.id, version: target.version },
        data: { deletedAt: actor.at },
      });
      if (count === 0) throw versionConflict();
      await auditCore(tx, actor, {
        action: 'core.position.delete',
        entityType: 'position',
        entityId: position.id,
        changes: { name: position.name },
      });
    });
  }
}

/** Cargo al que reporta el cargo dado (el del jefe inmediato), o null en la cabeza. */
export async function superiorPositionId(
  tx: TenantTransaction,
  positionId: string,
): Promise<string | null> {
  const position = await tx.position.findFirst({
    where: { id: positionId, deletedAt: null },
    select: { reportsToId: true },
  });
  return position?.reportsToId ?? null;
}

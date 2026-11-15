import { Inject, Injectable } from '@nestjs/common';
import type { AssetMaintenance, CompleteMaintenance, ScheduleMaintenance } from '@arza/contracts';

import type { AstMaintenance } from '../../../generated/prisma/client.js';
import { DatabaseService } from '../../../platform/database/database.service.js';
import type { TenantTransaction } from '../../../platform/database/tenant-context.js';
import { idempotencyKeyReused } from '../../../platform/http/idempotency-key.js';
import { versionConflict } from '../../../platform/http/if-match.js';
import { bogotaToday, toCalendarDate } from '../../core/index.js';
import { recordInvalid, recordNotFound, statusInvalid } from './asset-messages.js';
import { dateColumn, findAsset, recordAstEvent, type AstActor } from './asset-support.js';
import { heldBy, maintenanceViews } from './asset-views.js';
import type { AssetViewer } from './assets.js';

// Mantenimientos de los activos (B34): se programan y, al hacerlos, se registran con su fecha y su
// costo. No cambian el estado del activo ni impiden asignarlo.

const ENTITY = 'ast_maintenance';

async function pendingMaintenance(tx: TenantTransaction, id: string): Promise<AstMaintenance> {
  const row = await tx.astMaintenance.findFirst({ where: { id, deletedAt: null } });
  if (row === null) throw recordNotFound('ese mantenimiento');
  if (row.doneOn !== null) throw statusInvalid('Ese mantenimiento ya se registró como hecho.');
  return row;
}

@Injectable()
export class MaintenanceUseCase {
  constructor(@Inject(DatabaseService) private readonly database: DatabaseService) {}

  /** Todos los mantenimientos, o solo los de los activos a cargo de la persona. */
  async list(viewer: AssetViewer): Promise<AssetMaintenance[]> {
    const where = viewer.seesAll ? {} : { asset: heldBy(viewer.principal.userId) };
    return this.database.withTenant(viewer.principal, (tx) => maintenanceViews(tx, where));
  }

  async schedule(
    actor: AstActor,
    assetId: string,
    key: string,
    input: ScheduleMaintenance,
  ): Promise<string> {
    const scope = { tenantId: actor.tenantId, userId: actor.userId };
    return this.database.withTenant(scope, async (tx) => {
      const prior = await tx.astMaintenance.findFirst({ where: { requestKey: key } });
      if (prior !== null) {
        if (prior.assetId === assetId && prior.kind === input.kind) return prior.id;
        throw idempotencyKeyReused();
      }
      const asset = await findAsset(tx, assetId);
      if (asset.status === 'retired') {
        throw statusInvalid('No se programa mantenimiento a un activo dado de baja.');
      }
      const row = await tx.astMaintenance.create({
        data: {
          tenantId: actor.tenantId,
          assetId,
          kind: input.kind,
          scheduledOn: dateColumn(input.scheduled_on),
          note: input.note,
          requestKey: key,
          createdBy: actor.userId,
        },
      });
      await recordAstEvent(tx, actor, {
        action: 'asset.maintenance.schedule',
        event: 'ast.maintenance.scheduled',
        entityType: ENTITY,
        entityId: row.id,
        payload: { asset_id: assetId, code: asset.code },
        changes: { asset: asset.code, kind: input.kind, scheduled_on: input.scheduled_on },
      });
      return row.id;
    });
  }

  async complete(
    actor: AstActor,
    id: string,
    version: number,
    input: CompleteMaintenance,
  ): Promise<void> {
    const scope = { tenantId: actor.tenantId, userId: actor.userId };
    await this.database.withTenant(scope, async (tx) => {
      const row = await pendingMaintenance(tx, id);
      if (input.done_on > bogotaToday(actor.at)) {
        throw recordInvalid('La fecha en que se hizo el mantenimiento no puede ser futura.');
      }
      const { count } = await tx.astMaintenance.updateMany({
        where: { id, version, doneOn: null, deletedAt: null },
        data: {
          doneOn: dateColumn(input.done_on),
          cost: input.cost,
          ...(input.note === null ? {} : { note: input.note }),
        },
      });
      if (count === 0) throw versionConflict();
      await recordAstEvent(tx, actor, {
        action: 'asset.maintenance.complete',
        event: 'ast.maintenance.completed',
        entityType: ENTITY,
        entityId: id,
        payload: { asset_id: row.assetId },
        changes: { done_on: input.done_on, cost: input.cost },
      });
    });
  }

  /** Quita un mantenimiento programado por error; uno ya hecho no se quita. */
  async remove(actor: AstActor, id: string): Promise<void> {
    const scope = { tenantId: actor.tenantId, userId: actor.userId };
    await this.database.withTenant(scope, async (tx) => {
      const row = await pendingMaintenance(tx, id);
      await tx.astMaintenance.updateMany({
        where: { id, doneOn: null, deletedAt: null },
        data: { deletedAt: actor.at },
      });
      await recordAstEvent(tx, actor, {
        action: 'asset.maintenance.remove',
        event: 'ast.maintenance.removed',
        entityType: ENTITY,
        entityId: id,
        payload: { asset_id: row.assetId },
        changes: { scheduled_on: toCalendarDate(row.scheduledOn), kind: row.kind },
      });
    });
  }
}

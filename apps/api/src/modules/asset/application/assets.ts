import { Inject, Injectable } from '@nestjs/common';
import {
  assetBookCsv,
  assetBookFileName,
  type Asset,
  type AssetDetail,
  type AssetListQuery,
  type RetireAsset,
  type SaveAsset,
} from '@arza/contracts';

import type { AstAsset, Prisma } from '../../../generated/prisma/client.js';
import type { Principal } from '../../../platform/access/principal.js';
import { CLOCK, type Clock } from '../../../platform/clock/clock.js';
import { DatabaseService } from '../../../platform/database/database.service.js';
import { idempotencyKeyReused } from '../../../platform/http/idempotency-key.js';
import { bogotaToday, nextBusinessCode, toCalendarDate } from '../../core/index.js';
import { dateProblem } from '../domain/asset-rules.js';
import { recordInvalid, recordNotFound, statusInvalid } from './asset-messages.js';
import {
  changeAsset,
  dateColumn,
  findAsset,
  recordAstEvent,
  type AstActor,
} from './asset-support.js';
import { assetViews, assignmentHistory, heldBy, maintenanceViews } from './asset-views.js';

// Inventario de activos fijos y licencias (B34, ficha 17.12, RE-ADM-003): alta, edición, baja y
// el libro de activos. Quien solo tiene el permiso «solo lo propio» ve los activos a su cargo.

const ENTITY = 'ast_asset';

/** Qué ve la persona: todo el inventario o solo lo que tiene a su cargo. */
export interface AssetViewer {
  readonly principal: Principal;
  readonly seesAll: boolean;
}

export interface AssetBookFile {
  readonly fileName: string;
  readonly content: string;
}

type AssetData = Pick<
  Prisma.AstAssetUncheckedCreateInput,
  'name' | 'category' | 'serial' | 'purchaseDate' | 'cost' | 'usefulLifeMonths' | 'location'
>;

function assetData(input: SaveAsset, today: string): AssetData {
  const problem = dateProblem(input.purchase_date, { today }, 'La fecha de compra');
  if (problem !== null) throw recordInvalid(problem);
  return {
    name: input.name,
    category: input.category,
    serial: input.serial,
    purchaseDate: dateColumn(input.purchase_date),
    cost: input.cost,
    usefulLifeMonths: input.useful_life_months,
    location: input.location,
  };
}

function sameAsset(prior: AstAsset, input: SaveAsset): boolean {
  return prior.name === input.name && toCalendarDate(prior.purchaseDate) === input.purchase_date;
}

/** Solo se da de baja un activo disponible, en una fecha ni futura ni anterior a la compra. */
function assertRetirable(asset: AstAsset, retiredOn: string, today: string): void {
  if (asset.status !== 'available') {
    throw statusInvalid(
      asset.status === 'retired'
        ? 'Ese activo ya está dado de baja.'
        : 'El activo está asignado o pendiente de firma. Registre la devolución o anule la asignación antes de darlo de baja.',
    );
  }
  const limits = { today, notBefore: toCalendarDate(asset.purchaseDate) };
  const problem = dateProblem(retiredOn, limits, 'La fecha de baja');
  if (problem !== null) throw recordInvalid(problem);
}

function scopeOf(viewer: AssetViewer, query: AssetListQuery): Prisma.AstAssetWhereInput {
  if (!viewer.seesAll) return heldBy(viewer.principal.userId);
  return query.holder_id === undefined ? {} : heldBy(query.holder_id);
}

@Injectable()
export class AssetsUseCase {
  constructor(
    @Inject(DatabaseService) private readonly database: DatabaseService,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  async list(viewer: AssetViewer, query: AssetListQuery): Promise<Asset[]> {
    const today = bogotaToday(this.clock.now());
    return this.database.withTenant(viewer.principal, (tx) =>
      assetViews(tx, today, scopeOf(viewer, query)),
    );
  }

  async detail(viewer: AssetViewer, id: string): Promise<AssetDetail> {
    const today = bogotaToday(this.clock.now());
    return this.database.withTenant(viewer.principal, async (tx) => {
      const [asset] = await assetViews(tx, today, { ...scopeOf(viewer, {}), id });
      if (asset === undefined) throw recordNotFound('ese activo');
      const [assignments, maintenance] = await Promise.all([
        viewer.seesAll ? assignmentHistory(tx, id) : [],
        maintenanceViews(tx, { assetId: id }),
      ]);
      return { asset, assignments, maintenance };
    });
  }

  async create(actor: AstActor, key: string, input: SaveAsset): Promise<string> {
    const scope = { tenantId: actor.tenantId, userId: actor.userId };
    return this.database.withTenant(scope, async (tx) => {
      const prior = await tx.astAsset.findFirst({ where: { requestKey: key } });
      if (prior !== null) {
        if (sameAsset(prior, input)) return prior.id;
        throw idempotencyKeyReused();
      }
      const asset = await tx.astAsset.create({
        data: {
          tenantId: actor.tenantId,
          code: await nextBusinessCode(tx, 'ast.asset', actor.at, {
            name: 'Activos',
            prefix: 'ACT',
            padding: 4,
          }),
          ...assetData(input, bogotaToday(actor.at)),
          requestKey: key,
          createdBy: actor.userId,
        },
      });
      await recordAstEvent(tx, actor, {
        action: 'asset.create',
        event: 'ast.asset.created',
        entityType: ENTITY,
        entityId: asset.id,
        payload: { code: asset.code },
        changes: { code: asset.code, category: input.category, cost: input.cost },
      });
      return asset.id;
    });
  }

  async update(actor: AstActor, id: string, version: number, input: SaveAsset): Promise<void> {
    const scope = { tenantId: actor.tenantId, userId: actor.userId };
    await this.database.withTenant(scope, async (tx) => {
      const asset = await findAsset(tx, id);
      if (asset.status === 'retired') throw statusInvalid('Un activo dado de baja no se edita.');
      const data = assetData(input, bogotaToday(actor.at));
      await changeAsset(tx, { id, version, status: asset.status }, data);
      await recordAstEvent(tx, actor, {
        action: 'asset.update',
        event: 'ast.asset.updated',
        entityType: ENTITY,
        entityId: id,
        payload: { code: asset.code },
        changes: {
          name: [asset.name, input.name],
          cost: [asset.cost.toFixed(2), input.cost],
          useful_life_months: [asset.usefulLifeMonths, input.useful_life_months],
        },
      });
    });
  }

  /** Baja de un activo disponible: uno asignado o pendiente de firma se devuelve o anula antes. */
  async retire(actor: AstActor, id: string, version: number, input: RetireAsset): Promise<void> {
    const scope = { tenantId: actor.tenantId, userId: actor.userId };
    await this.database.withTenant(scope, async (tx) => {
      const asset = await findAsset(tx, id);
      assertRetirable(asset, input.retired_on, bogotaToday(actor.at));
      await changeAsset(
        tx,
        { id, version, status: 'available' },
        {
          status: 'retired',
          retiredOn: dateColumn(input.retired_on),
          retireReason: input.reason,
          retireNote: input.note,
          retiredBy: actor.userId,
        },
      );
      await recordAstEvent(tx, actor, {
        action: 'asset.retire',
        event: 'ast.asset.retired',
        entityType: ENTITY,
        entityId: id,
        payload: { code: asset.code, reason: input.reason },
        changes: {
          status: ['available', 'retired'],
          retired_on: input.retired_on,
          reason: input.reason,
        },
      });
    });
  }

  /** El libro de activos (RE-ADM-003) como archivo; la descarga queda en la auditoría. */
  async book(actor: AstActor): Promise<AssetBookFile> {
    const today = bogotaToday(actor.at);
    const scope = { tenantId: actor.tenantId, userId: actor.userId };
    return this.database.withTenant(scope, async (tx) => {
      const assets = await assetViews(tx, today, {});
      await recordAstEvent(tx, actor, {
        action: 'asset.book.export',
        event: 'ast.book.exported',
        entityType: ENTITY,
        entityId: actor.tenantId,
        payload: { rows: assets.length },
        changes: { rows: assets.length, as_of: today },
      });
      return { fileName: assetBookFileName(today), content: assetBookCsv(assets) };
    });
  }
}

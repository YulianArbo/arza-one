import { Inject, Injectable } from '@nestjs/common';
import type {
  CatalogDetailResponse,
  CatalogItem as CatalogItemView,
  CatalogSummary,
  CreateCatalogItemRequest,
  UpdateCatalogItemRequest,
} from '@arza/contracts';

import type { Catalog, CatalogItem } from '../../../generated/prisma/client.js';
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

function itemView(item: CatalogItem): CatalogItemView {
  return {
    id: item.id,
    code: item.code,
    label: item.label,
    sort_order: item.sortOrder,
    is_active: item.isActive,
    version: item.version,
  };
}

function itemAudit(item: CatalogItem) {
  return { label: item.label, sort_order: item.sortOrder, is_active: item.isActive };
}

function summaryOf(catalog: Catalog, itemCount: number): CatalogSummary {
  return {
    key: catalog.key,
    name: catalog.name,
    description: catalog.description,
    item_count: itemCount,
  };
}

async function findCatalog(tx: TenantTransaction, key: string): Promise<Catalog> {
  const catalog = await tx.catalog.findFirst({ where: { key, deletedAt: null } });
  if (catalog === null) throw recordNotFound('El catálogo');
  return catalog;
}

async function findItem(tx: TenantTransaction, catalog: Catalog, id: string) {
  const item = await tx.catalogItem.findFirst({
    where: { id, catalogId: catalog.id, deletedAt: null },
  });
  if (item === null) throw recordNotFound('La opción');
  return item;
}

/** La opción existe y está activa: los demás módulos validan así lo que eligen las personas. */
export async function isActiveCatalogCode(
  tx: TenantTransaction,
  key: string,
  code: string,
): Promise<boolean> {
  const count = await tx.catalogItem.count({
    where: { code, isActive: true, deletedAt: null, catalog: { key, deletedAt: null } },
  });
  return count > 0;
}

/**
 * Catálogos administrables (ficha 17.1). La lista la crea el sistema y la empresa administra sus
 * opciones. Una opción no se borra, porque los registros la guardan: se inactiva y deja de
 * ofrecerse en los formularios.
 */
@Injectable()
export class CatalogsUseCase {
  constructor(
    @Inject(DatabaseService) private readonly database: DatabaseService,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  private actor(principal: Principal, meta: RequestMeta): CoreActor {
    return { context: principal, meta, at: this.clock.now() };
  }

  async list(principal: Principal): Promise<CatalogSummary[]> {
    const catalogs = await this.database.withTenant(principal, (tx) =>
      tx.catalog.findMany({
        where: { deletedAt: null },
        orderBy: { name: 'asc' },
        include: { _count: { select: { items: { where: { deletedAt: null } } } } },
      }),
    );
    return catalogs.map((catalog) => summaryOf(catalog, catalog._count.items));
  }

  async detail(principal: Principal, key: string): Promise<CatalogDetailResponse> {
    return this.database.withTenant(principal, async (tx) => {
      const catalog = await findCatalog(tx, key);
      const items = await tx.catalogItem.findMany({
        where: { catalogId: catalog.id, deletedAt: null },
        orderBy: [{ sortOrder: 'asc' }, { label: 'asc' }],
      });
      return { ...summaryOf(catalog, items.length), items: items.map(itemView) };
    });
  }

  async addItem(
    principal: Principal,
    key: string,
    input: CreateCatalogItemRequest,
    meta: RequestMeta,
  ): Promise<string> {
    const actor = this.actor(principal, meta);
    return this.database.withTenant(principal, async (tx) => {
      const catalog = await findCatalog(tx, key);
      const taken = await tx.catalogItem.count({
        where: { catalogId: catalog.id, code: input.code },
      });
      if (taken > 0) throw codeTaken();
      const item = await tx.catalogItem.create({
        data: {
          tenantId: principal.tenantId,
          catalogId: catalog.id,
          code: input.code,
          label: input.label,
          sortOrder: input.sort_order,
        },
      });
      await auditCore(tx, actor, {
        action: 'core.catalog_item.create',
        entityType: 'catalog_item',
        entityId: item.id,
        changes: { catalog: catalog.key, code: item.code, ...itemAudit(item) },
      });
      return item.id;
    });
  }

  async updateItem(
    principal: Principal,
    key: string,
    target: Versioned,
    input: UpdateCatalogItemRequest,
    meta: RequestMeta,
  ): Promise<CatalogItemView> {
    const actor = this.actor(principal, meta);
    return this.database.withTenant(principal, async (tx) => {
      const catalog = await findCatalog(tx, key);
      const before = await findItem(tx, catalog, target.id);
      const { count } = await tx.catalogItem.updateMany({
        where: { id: before.id, version: target.version },
        data: { label: input.label, sortOrder: input.sort_order, isActive: input.is_active },
      });
      if (count === 0) throw versionConflict();
      const item = await findItem(tx, catalog, before.id);
      await auditCore(tx, actor, {
        action: 'core.catalog_item.update',
        entityType: 'catalog_item',
        entityId: item.id,
        changes: changesBetween(itemAudit(before), itemAudit(item)),
      });
      return itemView(item);
    });
  }
}

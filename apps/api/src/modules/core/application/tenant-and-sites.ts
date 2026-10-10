import { Inject, Injectable } from '@nestjs/common';
import type {
  CreateSiteRequest,
  Site as SiteView,
  TenantProfile,
  UpdateSiteRequest,
  UpdateTenantRequest,
} from '@arza/contracts';

import type { Site } from '../../../generated/prisma/client.js';
import type { Principal } from '../../../platform/access/principal.js';
import { changesBetween } from '../../../platform/audit/audit-recorder.js';
import { CLOCK, type Clock } from '../../../platform/clock/clock.js';
import { DatabaseService } from '../../../platform/database/database.service.js';
import type { TenantTransaction } from '../../../platform/database/tenant-context.js';
import { versionConflict } from '../../../platform/http/if-match.js';
import type { RequestMeta } from '../../../platform/http/request-meta.js';
import { auditCore, type CoreActor } from './core-audit.js';
import { mainSiteRequired, recordNotFound, taxIdTaken } from './core-messages.js';
import { isUniqueViolation, type Versioned } from './records.js';

function siteView(site: Site): SiteView {
  return {
    id: site.id,
    name: site.name,
    city: site.city,
    address: site.address,
    is_main: site.isMain,
    is_active: site.isActive,
    version: site.version,
  };
}

function siteAudit(site: Pick<Site, 'name' | 'city' | 'address' | 'isMain' | 'isActive'>) {
  return {
    name: site.name,
    city: site.city,
    address: site.address,
    is_main: site.isMain,
    is_active: site.isActive,
  };
}

async function findSite(tx: TenantTransaction, id: string): Promise<Site> {
  const site = await tx.site.findFirst({ where: { id, deletedAt: null } });
  if (site === null) throw recordNotFound('La sede');
  return site;
}

/** Solo una sede es la principal: al marcar una, las demás dejan de serlo. */
async function clearOtherMainSites(tx: TenantTransaction, keepId: string): Promise<void> {
  await tx.site.updateMany({
    where: { isMain: true, id: { not: keepId }, deletedAt: null },
    data: { isMain: false },
  });
}

/** Datos legales de la empresa y sus sedes (ficha 17.1). */
@Injectable()
export class TenantAndSitesUseCase {
  constructor(
    @Inject(DatabaseService) private readonly database: DatabaseService,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  private actor(principal: Principal, meta: RequestMeta): CoreActor {
    return { context: principal, meta, at: this.clock.now() };
  }

  async tenant(principal: Principal): Promise<TenantProfile> {
    const tenant = await this.database.withTenant(principal, (tx) =>
      tx.tenant.findUniqueOrThrow({ where: { id: principal.tenantId } }),
    );
    return {
      id: tenant.id,
      legal_name: tenant.legalName,
      trade_name: tenant.tradeName,
      tax_id: tenant.taxId,
      version: tenant.version,
    };
  }

  async updateTenant(
    principal: Principal,
    version: number,
    input: UpdateTenantRequest,
    meta: RequestMeta,
  ): Promise<TenantProfile> {
    const actor = this.actor(principal, meta);
    try {
      await this.database.withTenant(principal, async (tx) => {
        const before = await tx.tenant.findUniqueOrThrow({ where: { id: principal.tenantId } });
        if (before.version !== version) throw versionConflict();
        const after = {
          legalName: input.legal_name,
          tradeName: input.trade_name,
          taxId: input.tax_id,
        };
        const { count } = await tx.tenant.updateMany({
          where: { id: before.id, version },
          data: after,
        });
        if (count === 0) throw versionConflict();
        const old = {
          legalName: before.legalName,
          tradeName: before.tradeName,
          taxId: before.taxId,
        };
        await auditCore(tx, actor, {
          action: 'core.tenant.update',
          entityType: 'tenant',
          entityId: before.id,
          changes: changesBetween(old, after),
        });
      });
    } catch (error) {
      // El NIT es único en toda la plataforma; la otra empresa no se ve por la seguridad por fila.
      if (isUniqueViolation(error)) throw taxIdTaken();
      throw error;
    }
    return this.tenant(principal);
  }

  async sites(principal: Principal): Promise<SiteView[]> {
    const sites = await this.database.withTenant(principal, (tx) =>
      tx.site.findMany({
        where: { deletedAt: null },
        orderBy: [{ isMain: 'desc' }, { name: 'asc' }],
      }),
    );
    return sites.map(siteView);
  }

  async createSite(
    principal: Principal,
    input: CreateSiteRequest,
    meta: RequestMeta,
  ): Promise<string> {
    const actor = this.actor(principal, meta);
    return this.database.withTenant(principal, async (tx) => {
      const hasMain = (await tx.site.count({ where: { isMain: true, deletedAt: null } })) > 0;
      const site = await tx.site.create({
        data: {
          tenantId: principal.tenantId,
          name: input.name,
          city: input.city,
          address: input.address,
          isMain: input.is_main || !hasMain,
        },
      });
      if (site.isMain) await clearOtherMainSites(tx, site.id);
      await auditCore(tx, actor, {
        action: 'core.site.create',
        entityType: 'site',
        entityId: site.id,
        changes: siteAudit(site),
      });
      return site.id;
    });
  }

  async updateSite(
    principal: Principal,
    target: Versioned,
    input: UpdateSiteRequest,
    meta: RequestMeta,
  ): Promise<SiteView> {
    const actor = this.actor(principal, meta);
    return this.database.withTenant(principal, async (tx) => {
      const before = await findSite(tx, target.id);
      if (before.version !== target.version) throw versionConflict();
      const losesMain = before.isMain && !input.is_main;
      if (losesMain || (input.is_main && !input.is_active)) throw mainSiteRequired();
      const data = {
        name: input.name,
        city: input.city,
        address: input.address,
        isMain: input.is_main,
        isActive: input.is_active,
      };
      const { count } = await tx.site.updateMany({
        where: { id: before.id, version: before.version },
        data,
      });
      if (count === 0) throw versionConflict();
      const site = await findSite(tx, before.id);
      if (site.isMain) await clearOtherMainSites(tx, site.id);
      await auditCore(tx, actor, {
        action: 'core.site.update',
        entityType: 'site',
        entityId: site.id,
        changes: changesBetween(siteAudit(before), siteAudit(site)),
      });
      return siteView(site);
    });
  }

  async deleteSite(principal: Principal, target: Versioned, meta: RequestMeta): Promise<void> {
    const actor = this.actor(principal, meta);
    await this.database.withTenant(principal, async (tx) => {
      const site = await findSite(tx, target.id);
      if (site.version !== target.version) throw versionConflict();
      if (site.isMain) throw mainSiteRequired();
      const { count } = await tx.site.updateMany({
        where: { id: site.id, version: site.version },
        data: { deletedAt: actor.at },
      });
      if (count === 0) throw versionConflict();
      await auditCore(tx, actor, {
        action: 'core.site.delete',
        entityType: 'site',
        entityId: site.id,
        changes: { name: site.name },
      });
    });
  }
}

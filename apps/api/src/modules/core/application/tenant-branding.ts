import { Inject, Injectable } from '@nestjs/common';
import type {
  ImageUploadRequest,
  TenantBranding,
  UpdateTenantBrandingRequest,
  UploadLinkResponse,
} from '@arza/contracts';

import {
  assertUsableImage,
  imageNotFound,
  PROFILE_IMAGES,
  type ProfileImages,
  type StoredImage,
} from '../../iam/index.js';
import type { Principal } from '../../../platform/access/principal.js';
import { changesBetween } from '../../../platform/audit/audit-recorder.js';
import { CLOCK, type Clock } from '../../../platform/clock/clock.js';
import { DatabaseService } from '../../../platform/database/database.service.js';
import type { TenantTransaction } from '../../../platform/database/tenant-context.js';
import { versionConflict } from '../../../platform/http/if-match.js';
import type { RequestMeta } from '../../../platform/http/request-meta.js';
import { auditCore, type CoreActor } from './core-audit.js';

// Marca propia de la empresa (B48, decisión 11): nombre para mostrar, color principal y logo. La
// cambia quien puede cambiar los datos de la empresa (core.tenant.update); la ven todas las
// personas de la empresa, internas y del portal. Cada cambio queda auditado.

interface BrandRow {
  readonly legalName: string;
  readonly tradeName: string | null;
  readonly brandDisplayName: string | null;
  readonly brandColor: string | null;
  readonly brandLogoFileId: string | null;
  readonly version: number;
}

async function brandRow(tx: TenantTransaction): Promise<BrandRow> {
  return tx.tenant.findFirstOrThrow({
    select: {
      legalName: true,
      tradeName: true,
      brandDisplayName: true,
      brandColor: true,
      brandLogoFileId: true,
      version: true,
    },
  });
}

function brandingView(row: BrandRow): TenantBranding {
  return {
    display_name: row.brandDisplayName ?? row.tradeName ?? row.legalName,
    primary_color: row.brandColor,
    has_logo: row.brandLogoFileId !== null,
    version: row.version,
  };
}

@Injectable()
export class TenantBrandingUseCase {
  constructor(
    @Inject(DatabaseService) private readonly database: DatabaseService,
    @Inject(CLOCK) private readonly clock: Clock,
    @Inject(PROFILE_IMAGES) private readonly images: ProfileImages,
  ) {}

  private actor(principal: Principal, meta: RequestMeta): CoreActor {
    return { context: principal, meta, at: this.clock.now() };
  }

  async branding(principal: Principal): Promise<TenantBranding> {
    return brandingView(await this.database.withTenant(principal, brandRow));
  }

  async update(
    principal: Principal,
    version: number,
    input: UpdateTenantBrandingRequest,
    meta: RequestMeta,
  ): Promise<TenantBranding> {
    const actor = this.actor(principal, meta);
    await this.database.withTenant(principal, async (tx) => {
      const before = await brandRow(tx);
      if (before.version !== version) throw versionConflict();
      const after = { brandDisplayName: input.display_name, brandColor: input.primary_color };
      const { count } = await tx.tenant.updateMany({ where: { version }, data: after });
      if (count === 0) throw versionConflict();
      await auditCore(tx, actor, {
        action: 'core.tenant.branding_update',
        entityType: 'tenant',
        entityId: principal.tenantId,
        changes: changesBetween(
          { brandDisplayName: before.brandDisplayName, brandColor: before.brandColor },
          after,
        ),
      });
    });
    return this.branding(principal);
  }

  requestLogoUpload(
    principal: Principal,
    input: ImageUploadRequest,
    meta: RequestMeta,
  ): Promise<UploadLinkResponse> {
    return this.images.requestUpload(principal, input, meta);
  }

  async setLogo(principal: Principal, fileId: string, meta: RequestMeta): Promise<void> {
    await this.database.withTenant(principal, async (tx) => {
      assertUsableImage(await this.images.ownImageState(tx, principal, fileId));
      await this.changeLogo(tx, this.actor(principal, meta), fileId);
    });
  }

  async removeLogo(principal: Principal, meta: RequestMeta): Promise<void> {
    await this.database.withTenant(principal, (tx) =>
      this.changeLogo(tx, this.actor(principal, meta), null),
    );
  }

  async logo(principal: Principal): Promise<StoredImage> {
    return this.database.withTenant(principal, async (tx) => {
      const { brandLogoFileId } = await brandRow(tx);
      const image = brandLogoFileId === null ? null : await this.images.open(tx, brandLogoFileId);
      if (image === null) throw imageNotFound();
      return image;
    });
  }

  private async changeLogo(
    tx: TenantTransaction,
    actor: CoreActor,
    fileId: string | null,
  ): Promise<void> {
    const before = await brandRow(tx);
    if (before.brandLogoFileId === fileId) return;
    await tx.tenant.updateMany({ data: { brandLogoFileId: fileId } });
    await auditCore(tx, actor, {
      action: fileId === null ? 'core.tenant.logo_remove' : 'core.tenant.logo_update',
      entityType: 'tenant',
      entityId: actor.context.tenantId,
      changes: { brand_logo_file_id: { from: before.brandLogoFileId, to: fileId } },
    });
  }
}

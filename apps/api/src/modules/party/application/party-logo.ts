import { Inject, Injectable } from '@nestjs/common';
import type { ImageUploadRequest, UploadLinkResponse } from '@arza/contracts';

import {
  PROFILE_IMAGES,
  assertUsableImage,
  imageNotAllowed,
  imageNotFound,
  type ProfileImages,
  type StoredImage,
} from '../../iam/index.js';
import type { AppAbility } from '../../../platform/access/ability.js';
import type { Principal } from '../../../platform/access/principal.js';
import { CLOCK, type Clock } from '../../../platform/clock/clock.js';
import { DatabaseService } from '../../../platform/database/database.service.js';
import type { TenantTransaction } from '../../../platform/database/tenant-context.js';
import type { RequestMeta } from '../../../platform/http/request-meta.js';
import { ALL_PARTIES, auditParty, findParty, scopeOf } from './party-support.js';

/**
 * Logo de una empresa en Terceros (B22A): lo sube, cambia o quita quien puede editar terceros, con
 * una imagen propia ya revisada por el antivirus; lo ven quienes ven el tercero y, en el portal,
 * las personas de esa empresa. Cada cambio queda auditado.
 */
@Injectable()
export class PartyLogoUseCase {
  constructor(
    @Inject(DatabaseService) private readonly database: DatabaseService,
    @Inject(CLOCK) private readonly clock: Clock,
    @Inject(PROFILE_IMAGES) private readonly images: ProfileImages,
  ) {}

  async requestUpload(
    principal: Principal,
    partyId: string,
    input: ImageUploadRequest,
    meta: RequestMeta,
  ): Promise<UploadLinkResponse> {
    await this.database.withTenant(principal, (tx) => organization(tx, partyId));
    return this.images.requestUpload(principal, input, meta);
  }

  async set(
    principal: Principal,
    partyId: string,
    fileId: string,
    meta: RequestMeta,
  ): Promise<void> {
    await this.database.withTenant(principal, async (tx) => {
      await organization(tx, partyId);
      assertUsableImage(await this.images.ownImageState(tx, principal, fileId));
      await this.change(tx, { principal, meta, partyId, fileId });
    });
  }

  async remove(principal: Principal, partyId: string, meta: RequestMeta): Promise<void> {
    await this.database.withTenant(principal, async (tx) => {
      await organization(tx, partyId);
      await this.change(tx, { principal, meta, partyId, fileId: null });
    });
  }

  async open(principal: Principal, ability: AppAbility, partyId: string): Promise<StoredImage> {
    return this.database.withTenant(principal, async (tx) => {
      const party = await findParty(tx, scopeOf(principal, ability), partyId);
      const image = party.logoFileId === null ? null : await this.images.open(tx, party.logoFileId);
      if (image === null) throw imageNotFound();
      return image;
    });
  }

  private async change(tx: TenantTransaction, change: LogoChange): Promise<void> {
    const before = await findParty(tx, ALL_PARTIES, change.partyId);
    if (before.logoFileId === change.fileId) return;
    await tx.party.update({ where: { id: before.id }, data: { logoFileId: change.fileId } });
    await auditParty(
      tx,
      { principal: change.principal, meta: change.meta, at: this.clock.now() },
      {
        action: change.fileId === null ? 'party.logo_remove' : 'party.logo_update',
        entityType: 'party',
        entityId: before.id,
        changes: { logo_file_id: { from: before.logoFileId, to: change.fileId } },
      },
    );
  }
}

interface LogoChange {
  readonly principal: Principal;
  readonly meta: RequestMeta;
  readonly partyId: string;
  readonly fileId: string | null;
}

/** Solo las organizaciones llevan logo; una persona no. */
async function organization(tx: TenantTransaction, partyId: string): Promise<void> {
  const party = await findParty(tx, ALL_PARTIES, partyId);
  if (party.kind !== 'organization') {
    throw imageNotAllowed('Solo las empresas llevan logo; las personas no.');
  }
}

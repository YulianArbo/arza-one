import { Inject, Injectable } from '@nestjs/common';
import type { ImageUploadRequest, UploadLinkResponse } from '@arza/contracts';

import type { Principal } from '../../../platform/access/principal.js';
import { recordAuditEvent } from '../../../platform/audit/audit-recorder.js';
import { CLOCK, type Clock } from '../../../platform/clock/clock.js';
import { DatabaseService } from '../../../platform/database/database.service.js';
import type { TenantTransaction } from '../../../platform/database/tenant-context.js';
import type { RequestMeta } from '../../../platform/http/request-meta.js';
import { assertUsableImage, imageNotFound } from './image-messages.js';
import { PROFILE_IMAGES, type ProfileImages, type StoredImage } from './profile-ports.js';

/**
 * Foto de perfil (B22A): cada persona, interna o del portal, sube, cambia o quita la suya. Solo
 * puede usar una imagen que ella misma subió y que pasó el antivirus. Cada cambio queda auditado.
 */
@Injectable()
export class ProfilePhotoUseCase {
  constructor(
    @Inject(DatabaseService) private readonly database: DatabaseService,
    @Inject(CLOCK) private readonly clock: Clock,
    @Inject(PROFILE_IMAGES) private readonly images: ProfileImages,
  ) {}

  requestUpload(
    principal: Principal,
    input: ImageUploadRequest,
    meta: RequestMeta,
  ): Promise<UploadLinkResponse> {
    return this.images.requestUpload(principal, input, meta);
  }

  async set(principal: Principal, fileId: string, meta: RequestMeta): Promise<void> {
    await this.database.withTenant(principal, async (tx) => {
      assertUsableImage(await this.images.ownImageState(tx, principal, fileId));
      await this.change(tx, principal, fileId, meta);
    });
  }

  async remove(principal: Principal, meta: RequestMeta): Promise<void> {
    await this.database.withTenant(principal, (tx) => this.change(tx, principal, null, meta));
  }

  async open(principal: Principal): Promise<StoredImage> {
    return this.database.withTenant(principal, async (tx) => {
      const user = await tx.user.findUniqueOrThrow({ where: { id: principal.userId } });
      const image = user.photoFileId === null ? null : await this.images.open(tx, user.photoFileId);
      if (image === null) throw imageNotFound();
      return image;
    });
  }

  private async change(
    tx: TenantTransaction,
    principal: Principal,
    fileId: string | null,
    meta: RequestMeta,
  ): Promise<void> {
    const before = await tx.user.findUniqueOrThrow({ where: { id: principal.userId } });
    if (before.photoFileId === fileId) return;
    await tx.user.update({ where: { id: principal.userId }, data: { photoFileId: fileId } });
    await recordAuditEvent(tx, {
      tenantId: principal.tenantId,
      occurredAt: this.clock.now(),
      actor: { kind: 'user', id: principal.userId },
      action: fileId === null ? 'iam.user.photo_remove' : 'iam.user.photo_update',
      entityType: 'iam_user',
      entityId: principal.userId,
      result: 'success',
      changes: { photo_file_id: { from: before.photoFileId, to: fileId } },
      meta,
    });
  }
}

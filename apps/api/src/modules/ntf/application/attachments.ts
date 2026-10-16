import { Inject, Injectable } from '@nestjs/common';
import type {
  AttachmentList,
  CreateAttachmentRequest,
  CreatedResponse,
  DownloadLinkResponse,
  RecordRef,
} from '@arza/contracts';

import type { AppAbility } from '../../../platform/access/ability.js';
import { permissionDenied } from '../../../platform/access/permission-denied.js';
import type { Principal } from '../../../platform/access/principal.js';
import { CLOCK, type Clock } from '../../../platform/clock/clock.js';
import { DatabaseService } from '../../../platform/database/database.service.js';
import type { TenantTransaction } from '../../../platform/database/tenant-context.js';
import type { RequestMeta } from '../../../platform/http/request-meta.js';
import { AttachedFileLinks, attachedFiles, isAttachableFile } from '../../doc/index.js';
import { auditNtf } from './ntf-audit.js';
import { attachmentNotFound, fileNotAttachable } from './ntf-messages.js';
import { peopleViews, personIn } from './people.js';
import { recordFor, refOf, type RecordAccess } from './record-access.js';

// Adjuntos de cualquier registro (B16, ficha 17.5): un archivo que la persona ya subió y que pasó
// el antivirus (B14) queda ligado al registro. Quien ve el registro lo descarga; solo quien lo
// adjuntó puede retirarlo.

@Injectable()
export class AttachmentsUseCase {
  constructor(
    @Inject(DatabaseService) private readonly database: DatabaseService,
    @Inject(CLOCK) private readonly clock: Clock,
    @Inject(AttachedFileLinks) private readonly links: AttachedFileLinks,
  ) {}

  async list(principal: Principal, ability: AppAbility, ref: RecordRef): Promise<AttachmentList> {
    const access = this.accessOf(principal, ability);
    return this.database.withTenant(principal, async (tx) => {
      await recordFor(tx, access, ref, 'read');
      const rows = await tx.attachment.findMany({
        where: { entityType: ref.entity_type, entityId: ref.entity_id, deletedAt: null },
        orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
      });
      const [files, people] = await Promise.all([
        attachedFiles(
          tx,
          rows.map((row) => row.fileId),
        ),
        peopleViews(
          tx,
          rows.map((row) => row.createdBy),
        ),
      ]);
      return {
        items: rows.flatMap((row) => {
          const file = files.get(row.fileId);
          return file === undefined
            ? []
            : [
                {
                  id: row.id,
                  label: row.label,
                  file,
                  created_by: personIn(people, row.createdBy),
                  created_at: row.createdAt.toISOString(),
                  can_delete: row.createdBy === principal.userId,
                },
              ];
        }),
      };
    });
  }

  async create(
    principal: Principal,
    ability: AppAbility,
    input: CreateAttachmentRequest,
    meta: RequestMeta,
  ): Promise<CreatedResponse> {
    const access = this.accessOf(principal, ability);
    return this.database.withTenant(principal, async (tx) => {
      await recordFor(tx, access, input, 'write');
      if (!(await isAttachableFile(tx, principal, input.file_id))) throw fileNotAttachable();
      const attachment = await tx.attachment.create({
        data: {
          tenantId: principal.tenantId,
          entityType: input.entity_type,
          entityId: input.entity_id,
          fileId: input.file_id,
          label: input.label,
        },
      });
      await auditNtf(
        tx,
        { ...principal, meta, at: access.now },
        {
          action: 'ntf.attachment.create',
          entityType: 'core_attachment',
          entityId: attachment.id,
          changes: {
            entity_type: input.entity_type,
            entity_id: input.entity_id,
            file_id: input.file_id,
            label: input.label,
          },
        },
      );
      return { id: attachment.id };
    });
  }

  /** Retira el adjunto (el archivo sigue en el almacenamiento). Solo quien lo adjuntó. */
  async remove(
    principal: Principal,
    ability: AppAbility,
    id: string,
    meta: RequestMeta,
  ): Promise<void> {
    const access = this.accessOf(principal, ability);
    await this.database.withTenant(principal, async (tx) => {
      const row = await this.find(tx, access, id);
      if (row.createdBy !== principal.userId) throw permissionDenied();
      await tx.attachment.update({ where: { id }, data: { deletedAt: access.now } });
      await auditNtf(
        tx,
        { ...principal, meta, at: access.now },
        {
          action: 'ntf.attachment.delete',
          entityType: 'core_attachment',
          entityId: id,
          changes: { ...refOf(row), file_id: row.fileId },
        },
      );
    });
  }

  /** Enlace de descarga de cinco minutos del archivo adjunto. */
  async downloadLink(
    principal: Principal,
    ability: AppAbility,
    id: string,
    meta: RequestMeta,
  ): Promise<DownloadLinkResponse> {
    const access = this.accessOf(principal, ability);
    return this.database.withTenant(principal, async (tx) => {
      const row = await this.find(tx, access, id);
      return this.links.issue(tx, principal, row.fileId, meta);
    });
  }

  /** El adjunto, si existe y la persona ve su registro; si no, 404. */
  private async find(tx: TenantTransaction, access: RecordAccess, id: string) {
    const row = await tx.attachment.findFirst({ where: { id, deletedAt: null } });
    if (row === null) throw attachmentNotFound();
    await recordFor(tx, access, refOf(row), 'read');
    return row;
  }

  private accessOf(principal: Principal, ability: AppAbility): RecordAccess {
    return { principal, ability, now: this.clock.now() };
  }
}

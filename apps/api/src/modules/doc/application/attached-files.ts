import { Inject, Injectable } from '@nestjs/common';
import { allowedFileTypeSchema, type Attachment, type DownloadLinkResponse } from '@arza/contracts';

import type { Principal } from '../../../platform/access/principal.js';
import { recordAuditEvent } from '../../../platform/audit/audit-recorder.js';
import { CLOCK, type Clock } from '../../../platform/clock/clock.js';
import type { TenantTransaction } from '../../../platform/database/tenant-context.js';
import type { RequestMeta } from '../../../platform/http/request-meta.js';
import { fileNotAvailable } from './file-messages.js';
import { FileLinkIssuer } from './file-link-issuer.js';

export type AttachedFile = Attachment['file'];

// Archivos adjuntos a registros de otros módulos (B16). Quien adjunta solo puede usar un archivo
// que él mismo subió y que pasó el antivirus. Quien ve el registro puede descargarlo: el módulo
// dueño del registro ya verificó ese permiso antes de pedir el enlace.

/** Archivos para mostrar en los adjuntos, por identificador. */
export async function attachedFiles(
  tx: TenantTransaction,
  ids: readonly string[],
): Promise<Map<string, AttachedFile>> {
  if (ids.length === 0) return new Map();
  const files = await tx.file.findMany({ where: { id: { in: [...new Set(ids)] } } });
  return new Map(
    files.map((file) => [
      file.id,
      {
        id: file.id,
        file_name: file.fileName,
        mime_type: allowedFileTypeSchema.parse(file.mimeType),
        size_bytes: file.sizeBytes,
      },
    ]),
  );
}

/** El archivo existe, está disponible y lo subió la persona: se puede adjuntar. */
export async function isAttachableFile(
  tx: TenantTransaction,
  principal: Principal,
  fileId: string,
): Promise<boolean> {
  const count = await tx.file.count({
    where: {
      id: fileId,
      createdBy: principal.userId,
      scanStatus: 'available',
      deletedAt: null,
    },
  });
  return count > 0;
}

@Injectable()
export class AttachedFileLinks {
  constructor(
    @Inject(CLOCK) private readonly clock: Clock,
    @Inject(FileLinkIssuer) private readonly issuer: FileLinkIssuer,
  ) {}

  /** Enlace de descarga de un archivo adjunto, dentro de la transacción de quien lo pide. */
  async issue(
    tx: TenantTransaction,
    principal: Principal,
    fileId: string,
    meta: RequestMeta,
  ): Promise<DownloadLinkResponse> {
    const file = await tx.file.findFirst({
      where: { id: fileId, scanStatus: 'available', deletedAt: null },
    });
    if (file === null) throw fileNotAvailable();
    const link = await this.issuer.issue(principal, 'download', file.id);
    await recordAuditEvent(tx, {
      tenantId: principal.tenantId,
      occurredAt: this.clock.now(),
      actor: { kind: 'user', id: principal.userId },
      action: 'doc.file.download_link',
      entityType: 'doc_file',
      entityId: file.id,
      result: 'success',
      changes: { expires_at: link.expires_at, via: 'attachment' },
      meta,
    });
    return link;
  }
}

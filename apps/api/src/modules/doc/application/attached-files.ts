import type { Readable } from 'node:stream';

import { Inject, Injectable } from '@nestjs/common';
import { allowedFileTypeSchema, type Attachment, type DownloadLinkResponse } from '@arza/contracts';

import type { Principal } from '../../../platform/access/principal.js';
import { recordAuditEvent } from '../../../platform/audit/audit-recorder.js';
import { CLOCK, type Clock } from '../../../platform/clock/clock.js';
import type { TenantTransaction } from '../../../platform/database/tenant-context.js';
import type { RequestMeta } from '../../../platform/http/request-meta.js';
import type { FileStorage } from '../infrastructure/file-storage.js';
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

/** PDF que la persona puede adjuntar a una solicitud de firma y huella registrada al cargarlo. */
export async function attachablePdfForSignature(
  tx: TenantTransaction,
  principal: Pick<Principal, 'tenantId' | 'userId'>,
  fileId: string,
): Promise<{ id: string; sha256: string } | null> {
  const file = await tx.file.findFirst({
    where: {
      id: fileId,
      tenantId: principal.tenantId,
      createdBy: principal.userId,
      scanStatus: 'available',
      deletedAt: null,
      mimeType: 'application/pdf',
    },
    select: { id: true, sha256: true },
  });
  if (file === null) return null;
  if (file.sha256 === null) return null;
  return { id: file.id, sha256: file.sha256 };
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

/** Un archivo disponible abierto para entregarlo tal cual, con su nombre y su tipo. */
export interface OpenedFile {
  readonly fileName: string;
  readonly mimeType: string;
  readonly sizeBytes: number;
  readonly content: Readable;
}

/**
 * Abre un archivo disponible para entregarlo sin enlace temporal, como el PDF de una cotización al
 * cliente que la abre sin sesión (B23). El módulo dueño del registro ya verificó que puede verlo.
 */
export async function openAvailableFile(
  tx: TenantTransaction,
  storage: Pick<FileStorage, 'stream'>,
  fileId: string,
): Promise<OpenedFile | null> {
  const file = await tx.file.findFirst({
    where: { id: fileId, scanStatus: 'available', deletedAt: null },
  });
  if (file === null) return null;
  return {
    fileName: file.fileName,
    mimeType: file.mimeType,
    sizeBytes: file.sizeBytes,
    content: await storage.stream(file.storageKey),
  };
}

/**
 * Retira un archivo adjunto cuyos datos personales ya deben eliminarse (B35, candidatos): queda
 * eliminado (ninguna descarga lo encuentra) y pierde su nombre. Su estado de análisis no cambia:
 * la base de datos lo protege. Devuelve la llave para borrarlo del almacenamiento después de la
 * transacción, o null si ya estaba retirado.
 */
export async function disposeAttachedFile(
  tx: TenantTransaction,
  fileId: string,
  at: Date,
): Promise<string | null> {
  const file = await tx.file.findFirst({
    where: { id: fileId, deletedAt: null },
    select: { storageKey: true },
  });
  if (file === null) return null;
  await tx.file.update({
    where: { id: fileId },
    data: { deletedAt: at, fileName: 'archivo-eliminado' },
  });
  return file.storageKey;
}

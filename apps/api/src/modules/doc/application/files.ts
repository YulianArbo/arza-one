import type { Readable } from 'node:stream';

import { Inject, Injectable } from '@nestjs/common';
import {
  allowedFileTypeSchema,
  fileRejectionSchema,
  fileStatusSchema,
  type CreateUploadRequest,
  type DownloadLinkResponse,
  type FileView,
  type UploadLinkResponse,
} from '@arza/contracts';
import { v7 as uuidv7 } from 'uuid';

import type { File, Prisma } from '../../../generated/prisma/client.js';
import { hasUnconditionalPermission, type AppAbility } from '../../../platform/access/ability.js';
import type { Principal } from '../../../platform/access/principal.js';
import { recordAuditEvent } from '../../../platform/audit/audit-recorder.js';
import { CLOCK, type Clock } from '../../../platform/clock/clock.js';
import { DatabaseService } from '../../../platform/database/database.service.js';
import type {
  TenantContext,
  TenantTransaction,
} from '../../../platform/database/tenant-context.js';
import type { RequestMeta } from '../../../platform/http/request-meta.js';
import { JobQueue } from '../../../platform/queues/job-queue.js';
import { JOBS } from '../../../platform/queues/jobs.js';
import { DOWNLOAD_LINK_TTL_MS, UPLOAD_LINK_TTL_MS, linkIsValid } from '../domain/file-rules.js';
import { FileLinks, type FileLink } from '../infrastructure/file-links.js';
import { FileStorage } from '../infrastructure/file-storage.js';
import {
  fileNotAvailable,
  fileNotFound,
  linkInvalid,
  uploadSizeMismatch,
  uploadTypeMismatch,
} from './file-messages.js';

/** Dirección pública de la API (API_URL); los enlaces conservan su prefijo, como /api. */
export const FILE_LINKS_BASE_URL = Symbol('FILE_LINKS_BASE_URL');

/** Contenido que llega por el enlace de subida, con las cabeceras que lo describen. */
export interface IncomingUpload {
  readonly body: Readable;
  readonly contentType: string | undefined;
  readonly contentLength: string | undefined;
}

export interface FileDownload {
  readonly fileName: string;
  readonly mimeType: string;
  readonly sizeBytes: number;
  readonly content: Readable;
}

/** shortcut: la lista trae los 200 más recientes, sin páginas; páginas cuando haya expedientes. */
const LIST_LIMIT = 200;

function fileView(file: File): FileView {
  return {
    id: file.id,
    file_name: file.fileName,
    mime_type: allowedFileTypeSchema.parse(file.mimeType),
    size_bytes: file.sizeBytes,
    sha256: file.sha256,
    status: fileStatusSchema.parse(file.scanStatus),
    rejection: file.rejection === null ? null : fileRejectionSchema.parse(file.rejection),
    created_at: file.createdAt.toISOString(),
  };
}

/** Quien solo ve «lo propio» (letra P) ve los archivos que él mismo subió. */
function visibleFiles(principal: Principal, ability: AppAbility): Prisma.FileWhereInput {
  return hasUnconditionalPermission(ability, 'doc.document.read')
    ? { deletedAt: null }
    : { deletedAt: null, createdBy: principal.userId };
}

interface FileAudit {
  readonly tenantId: string;
  readonly userId: string;
  readonly at: Date;
  readonly meta: RequestMeta;
  readonly action: string;
  readonly fileId: string;
  readonly changes?: Prisma.InputJsonObject;
}

async function auditFile(tx: TenantTransaction, event: FileAudit): Promise<void> {
  await recordAuditEvent(tx, {
    tenantId: event.tenantId,
    occurredAt: event.at,
    actor: { kind: 'user', id: event.userId },
    action: event.action,
    entityType: 'doc_file',
    entityId: event.fileId,
    result: 'success',
    ...(event.changes === undefined ? {} : { changes: event.changes }),
    meta: event.meta,
  });
}

function contextOf(link: FileLink): TenantContext {
  return { tenantId: link.tenantId, userId: link.userId };
}

/**
 * Archivos (B14, numeral 13.2): carga en dos pasos por enlace temporal, estado del análisis y
 * descarga por enlace de cinco minutos tras verificar el permiso. Cada enlace emitido y cada
 * descarga quedan en la auditoría: es el registro de accesos.
 */
@Injectable()
export class FilesUseCase {
  constructor(
    @Inject(DatabaseService) private readonly database: DatabaseService,
    @Inject(CLOCK) private readonly clock: Clock,
    @Inject(FileStorage) private readonly storage: FileStorage,
    @Inject(FileLinks) private readonly links: FileLinks,
    @Inject(JobQueue) private readonly queue: JobQueue,
    @Inject(FILE_LINKS_BASE_URL) private readonly baseUrl: string,
  ) {}

  /** Registra el archivo «esperando el archivo» y entrega el enlace de subida (un solo uso). */
  async requestUpload(
    principal: Principal,
    input: CreateUploadRequest,
    meta: RequestMeta,
  ): Promise<UploadLinkResponse> {
    const id = uuidv7();
    return this.database.withTenant(principal, async (tx) => {
      await tx.file.create({
        data: {
          id,
          tenantId: principal.tenantId,
          storageKey: `${principal.tenantId}/${id}`,
          fileName: input.file_name,
          mimeType: input.mime_type,
          sizeBytes: input.size_bytes,
        },
      });
      const { file_name, mime_type, size_bytes } = input;
      const changes = { file_name, mime_type, size_bytes };
      await auditFile(tx, {
        ...principal,
        at: this.clock.now(),
        meta,
        action: 'doc.file.create',
        fileId: id,
        changes,
      });
      const link = await this.issueLink(principal, 'upload', id);
      return { id, upload_url: link.url, expires_at: link.expires_at };
    });
  }

  /**
   * Recibe el contenido por el enlace de subida, lo guarda y pide su análisis. El enlace se gasta
   * solo si todo salió bien: si algo falla, la persona puede reintentar con el mismo enlace.
   */
  async receiveUpload(token: string, upload: IncomingUpload, meta: RequestMeta): Promise<void> {
    const link = await this.validLink(token, 'upload');
    const file = await this.database.withTenant(contextOf(link), (tx) =>
      tx.file.findFirst({
        where: { id: link.fileId, scanStatus: 'pending_upload', deletedAt: null },
      }),
    );
    if (file === null) throw linkInvalid();
    if (upload.contentType !== file.mimeType) throw uploadTypeMismatch();
    if (Number(upload.contentLength) !== file.sizeBytes) throw uploadSizeMismatch();
    await this.storage.put(
      { key: file.storageKey, contentType: file.mimeType, sizeBytes: file.sizeBytes },
      upload.body,
    );
    await this.database.withTenant(contextOf(link), async (tx) => {
      const { count } = await tx.file.updateMany({
        where: { id: file.id, scanStatus: 'pending_upload' },
        data: { scanStatus: 'scanning' },
      });
      if (count === 0) throw linkInvalid();
      await auditFile(tx, {
        tenantId: link.tenantId,
        userId: link.userId,
        at: this.clock.now(),
        meta,
        action: 'doc.file.upload',
        fileId: file.id,
      });
      // Dentro de la transacción: si la cola no responde, nada cambia y se puede reintentar.
      await this.queue.add(JOBS.fileScan, {
        tenantId: link.tenantId,
        userId: link.userId,
        correlationId: meta.correlationId ?? uuidv7(),
        fileId: file.id,
      });
    });
    await this.links.consume(token);
  }

  async list(principal: Principal, ability: AppAbility): Promise<FileView[]> {
    const files = await this.database.withTenant(principal, (tx) =>
      tx.file.findMany({
        where: visibleFiles(principal, ability),
        orderBy: { createdAt: 'desc' },
        take: LIST_LIMIT,
      }),
    );
    return files.map(fileView);
  }

  async get(principal: Principal, ability: AppAbility, id: string): Promise<FileView> {
    return fileView(
      await this.database.withTenant(principal, (tx) => this.find(tx, principal, ability, id)),
    );
  }

  /** Enlace de descarga de cinco minutos, solo de un archivo disponible que la persona puede ver. */
  async issueDownloadLink(
    principal: Principal,
    ability: AppAbility,
    id: string,
    meta: RequestMeta,
  ): Promise<DownloadLinkResponse> {
    return this.database.withTenant(principal, async (tx) => {
      const file = await this.find(tx, principal, ability, id);
      if (file.scanStatus !== 'available') throw fileNotAvailable();
      const link = await this.issueLink(principal, 'download', file.id);
      await auditFile(tx, {
        ...principal,
        at: this.clock.now(),
        meta,
        action: 'doc.file.download_link',
        fileId: file.id,
        changes: { expires_at: link.expires_at },
      });
      return link;
    });
  }

  /** Entrega el contenido por el enlace de descarga y deja la descarga en la auditoría. */
  async download(token: string, meta: RequestMeta): Promise<FileDownload> {
    const link = await this.validLink(token, 'download');
    const file = await this.database.withTenant(contextOf(link), async (tx) => {
      const found = await tx.file.findFirst({
        where: { id: link.fileId, scanStatus: 'available', deletedAt: null },
      });
      if (found === null) throw linkInvalid();
      await auditFile(tx, {
        tenantId: link.tenantId,
        userId: link.userId,
        at: this.clock.now(),
        meta,
        action: 'doc.file.download',
        fileId: found.id,
      });
      return found;
    });
    return {
      fileName: file.fileName,
      mimeType: file.mimeType,
      sizeBytes: file.sizeBytes,
      content: await this.storage.stream(file.storageKey),
    };
  }

  /**
   * Emite el enlace dentro de la transacción del caso de uso: si la auditoría falla, el enlace
   * queda en Valkey sin que nadie conozca su llave y vence solo.
   */
  private async issueLink(
    principal: Principal,
    purpose: FileLink['purpose'],
    fileId: string,
  ): Promise<DownloadLinkResponse> {
    const ttl = purpose === 'upload' ? UPLOAD_LINK_TTL_MS : DOWNLOAD_LINK_TTL_MS;
    const expiresAt = new Date(this.clock.now().getTime() + ttl).toISOString();
    const { tenantId, userId } = principal;
    const token = await this.links.issue({ tenantId, userId, purpose, fileId, expiresAt }, ttl);
    const base = this.baseUrl.endsWith('/') ? this.baseUrl : `${this.baseUrl}/`;
    const kind = purpose === 'upload' ? 'uploads' : 'downloads';
    return { url: new URL(`v1/files/${kind}/${token}`, base).toString(), expires_at: expiresAt };
  }

  private async validLink(token: string, purpose: FileLink['purpose']): Promise<FileLink> {
    const link = await this.links.find(token);
    if (link?.purpose !== purpose || !linkIsValid(new Date(link.expiresAt), this.clock.now())) {
      throw linkInvalid();
    }
    return link;
  }

  private async find(
    tx: TenantTransaction,
    principal: Principal,
    ability: AppAbility,
    id: string,
  ): Promise<File> {
    const file = await tx.file.findFirst({ where: { id, ...visibleFiles(principal, ability) } });
    if (file === null) throw fileNotFound();
    return file;
  }
}

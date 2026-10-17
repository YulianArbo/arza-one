import { createHash } from 'node:crypto';
import { Readable } from 'node:stream';

import { MAX_FILE_BYTES } from '@arza/contracts';
import { v7 as uuidv7 } from 'uuid';

import type { DocVersion, File } from '../../../generated/prisma/client.js';
import { recordAuditEvent } from '../../../platform/audit/audit-recorder.js';
import type { Clock } from '../../../platform/clock/clock.js';
import type { DatabaseService } from '../../../platform/database/database.service.js';
import type { TenantTransaction } from '../../../platform/database/tenant-context.js';
import type { VersionRenderJob } from '../../../platform/queues/jobs.js';
import type { FileStorage } from '../infrastructure/file-storage.js';
import {
  ConversionRejectedError,
  type SourceDocument,
} from '../infrastructure/gotenberg-converter.js';

// Conversión a PDF del archivo fuente de una versión (B18, ficha 17.4). La ejecuta el worker: lee
// el Word o el Excel, lo pasa por Gotenberg y guarda el PDF con su huella. Si el archivo fuente del
// borrador cambió mientras tanto, el PDF ya no sirve y se descarta.

export interface VersionRenderDependencies {
  readonly database: Pick<DatabaseService, 'withTenant'>;
  readonly clock: Clock;
  readonly storage: Pick<FileStorage, 'read' | 'put' | 'delete'>;
  readonly convert: (source: SourceDocument) => Promise<Buffer>;
}

export type VersionRenderResult = 'ready' | 'failed' | 'skipped';

type PendingVersion = DocVersion & { readonly sourceFile: File };

/** El borrador cambió de archivo fuente: el PDF que se generó ya no le corresponde. */
class StaleRenderError extends Error {}

function pdfName(fileName: string): string {
  const base = fileName.replace(/\.[^.]+$/u, '');
  return `${base.slice(0, 196)}.pdf`;
}

async function auditRender(
  tx: TenantTransaction,
  job: VersionRenderJob,
  at: Date,
  changes: Record<string, string | null>,
): Promise<void> {
  await recordAuditEvent(tx, {
    tenantId: job.tenantId,
    occurredAt: at,
    actor: { kind: 'system' },
    action: 'doc.version.render',
    entityType: 'doc_version',
    entityId: job.versionId,
    result: 'success',
    changes,
    meta: { ip: null, userAgent: null, correlationId: job.correlationId },
  });
}

/** Solo si el borrador sigue esperando el PDF de ese mismo archivo fuente. */
function stillPending(version: PendingVersion) {
  return { id: version.id, renderStatus: 'pending', sourceFileId: version.sourceFileId };
}

async function recordFailure(
  job: VersionRenderJob,
  version: PendingVersion,
  deps: VersionRenderDependencies,
): Promise<VersionRenderResult> {
  const context = { tenantId: job.tenantId, userId: null };
  return deps.database.withTenant(context, async (tx) => {
    const { count } = await tx.docVersion.updateMany({
      where: stillPending(version),
      data: { renderStatus: 'failed' },
    });
    if (count === 0) return 'skipped';
    await auditRender(tx, job, deps.clock.now(), { status: 'failed', pdf_file_id: null });
    return 'failed';
  });
}

async function recordPdf(
  job: VersionRenderJob,
  version: PendingVersion,
  pdf: { readonly id: string; readonly content: Buffer },
  deps: VersionRenderDependencies,
): Promise<void> {
  const at = deps.clock.now();
  await deps.database.withTenant({ tenantId: job.tenantId, userId: null }, async (tx) => {
    await tx.file.create({
      data: {
        id: pdf.id,
        tenantId: job.tenantId,
        storageKey: `${job.tenantId}/${pdf.id}`,
        fileName: pdfName(version.sourceFile.fileName),
        mimeType: 'application/pdf',
        sizeBytes: pdf.content.length,
        sha256: createHash('sha256').update(pdf.content).digest('hex'),
        scanStatus: 'available',
        scannedAt: at,
      },
    });
    const { count } = await tx.docVersion.updateMany({
      where: stillPending(version),
      data: { pdfFileId: pdf.id, renderStatus: 'ready' },
    });
    if (count === 0) throw new StaleRenderError();
    await auditRender(tx, job, at, { status: 'ready', pdf_file_id: pdf.id });
  });
}

/** Guarda el PDF; si el borrador ya cambió, lo borra del almacenamiento y no hace nada más. */
async function storePdf(
  job: VersionRenderJob,
  version: PendingVersion,
  content: Buffer,
  deps: VersionRenderDependencies,
): Promise<VersionRenderResult> {
  const pdf = { id: uuidv7(), content };
  const key = `${job.tenantId}/${pdf.id}`;
  await deps.storage.put(
    { key, contentType: 'application/pdf', sizeBytes: content.length },
    Readable.from(content),
  );
  try {
    await recordPdf(job, version, pdf, deps);
    return 'ready';
  } catch (error) {
    await deps.storage.delete(key);
    if (error instanceof StaleRenderError) return 'skipped';
    throw error;
  }
}

/**
 * Convierte el archivo fuente de la versión del trabajo. Repetirlo no cambia nada: una versión
 * que ya no espera su PDF se salta. Si Gotenberg o el almacenamiento no responden, el error hace
 * que BullMQ reintente; mientras tanto la versión sigue «convirtiendo» y no se envía a revisión.
 */
export async function renderVersionPdf(
  job: VersionRenderJob,
  deps: VersionRenderDependencies,
): Promise<VersionRenderResult> {
  const version = await deps.database.withTenant({ tenantId: job.tenantId, userId: null }, (tx) =>
    tx.docVersion.findFirst({ where: { id: job.versionId }, include: { sourceFile: true } }),
  );
  if (version?.renderStatus !== 'pending') return 'skipped';
  const { sourceFile } = version;
  const source = {
    fileName: sourceFile.fileName,
    mimeType: sourceFile.mimeType,
    content: await deps.storage.read(sourceFile.storageKey),
  };
  let content: Buffer;
  try {
    content = await deps.convert(source);
  } catch (error) {
    if (error instanceof ConversionRejectedError) return recordFailure(job, version, deps);
    throw error;
  }
  if (content.length === 0 || content.length > MAX_FILE_BYTES) {
    return recordFailure(job, version, deps);
  }
  return storePdf(job, version, content, deps);
}

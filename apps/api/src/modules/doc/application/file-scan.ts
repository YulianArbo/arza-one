import { createHash } from 'node:crypto';

import type { FileRejection } from '@arza/contracts';

import type { File } from '../../../generated/prisma/client.js';
import { recordAuditEvent, recordSecurityEvent } from '../../../platform/audit/audit-recorder.js';
import type { Clock } from '../../../platform/clock/clock.js';
import type { DatabaseService } from '../../../platform/database/database.service.js';
import type { TenantTransaction } from '../../../platform/database/tenant-context.js';
import type { FileScanJob } from '../../../platform/queues/jobs.js';
import { contentProblem } from '../domain/file-rules.js';
import type { ScanVerdict } from '../infrastructure/clamav-scanner.js';
import type { FileStorage } from '../infrastructure/file-storage.js';

// Análisis de un archivo recién subido (B14, numeral 13.2). Lo ejecuta el worker: lo pasa por el
// antivirus, revisa que el contenido sea del tipo y tamaño declarados y calcula su huella
// SHA-256. Un archivo rechazado se borra del almacenamiento; su registro y su huella quedan.

export interface FileScanDependencies {
  readonly database: Pick<DatabaseService, 'withTenant'>;
  readonly clock: Clock;
  readonly storage: Pick<FileStorage, 'read' | 'delete'>;
  readonly antivirus: (content: Buffer) => Promise<ScanVerdict>;
}

export type FileScanResult = 'available' | FileRejection | 'skipped';

/** El archivo aún no está marcado «en análisis»: la API todavía no confirma su transacción. */
export class FileNotReadyError extends Error {
  constructor(fileId: string) {
    super(`El archivo ${fileId} todavía no termina de subir; se reintenta.`);
    this.name = 'FileNotReadyError';
  }
}

interface Outcome {
  readonly sha256: string;
  readonly rejection: FileRejection | null;
  readonly signature: string | null;
}

async function analyze(file: File, content: Buffer, deps: FileScanDependencies): Promise<Outcome> {
  const sha256 = createHash('sha256').update(content).digest('hex');
  // Primero el antivirus: un virus disfrazado de otro tipo debe quedar como virus, con su alerta.
  const verdict = await deps.antivirus(content);
  if (verdict.infected) return { sha256, rejection: 'virus', signature: verdict.signature };
  return { sha256, rejection: contentProblem(file, content), signature: null };
}

async function recordOutcome(
  tx: TenantTransaction,
  job: FileScanJob,
  file: File,
  outcome: Outcome,
  at: Date,
): Promise<void> {
  const scanStatus = outcome.rejection === null ? 'available' : 'rejected';
  await tx.file.update({
    where: { id: file.id },
    data: { scanStatus, rejection: outcome.rejection, sha256: outcome.sha256, scannedAt: at },
  });
  const meta = { ip: null, userAgent: null, correlationId: job.correlationId };
  await recordAuditEvent(tx, {
    tenantId: job.tenantId,
    occurredAt: at,
    actor: { kind: 'system' },
    action: 'doc.file.scan',
    entityType: 'doc_file',
    entityId: file.id,
    result: 'success',
    changes: { status: scanStatus, rejection: outcome.rejection, sha256: outcome.sha256 },
    meta,
  });
  if (outcome.signature === null) return;
  await recordSecurityEvent(tx, {
    tenantId: job.tenantId,
    occurredAt: at,
    type: 'doc.file.virus_detected',
    userId: file.createdBy,
    severity: 'high',
    detail: { file_id: file.id, signature: outcome.signature },
    meta,
  });
}

/**
 * Analiza el archivo del trabajo. Repetirlo no cambia nada: un archivo ya analizado se salta (y,
 * si fue rechazado, se asegura de que su contenido ya no esté). Si el antivirus no responde, el
 * error hace que BullMQ reintente; mientras tanto el archivo sigue «en análisis» y no se descarga.
 */
export async function scanUploadedFile(
  job: FileScanJob,
  deps: FileScanDependencies,
): Promise<FileScanResult> {
  const context = { tenantId: job.tenantId, userId: null };
  const file = await deps.database.withTenant(context, (tx) =>
    tx.file.findFirst({ where: { id: job.fileId } }),
  );
  if (file === null || file.scanStatus === 'available') return 'skipped';
  if (file.scanStatus === 'rejected') {
    await deps.storage.delete(file.storageKey);
    return 'skipped';
  }
  if (file.scanStatus === 'pending_upload') throw new FileNotReadyError(file.id);
  const outcome = await analyze(file, await deps.storage.read(file.storageKey), deps);
  await deps.database.withTenant(context, (tx) =>
    recordOutcome(tx, job, file, outcome, deps.clock.now()),
  );
  if (outcome.rejection === null) return 'available';
  await deps.storage.delete(file.storageKey);
  return outcome.rejection;
}

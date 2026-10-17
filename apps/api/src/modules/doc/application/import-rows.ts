import { Readable } from 'node:stream';

import { v7 as uuidv7 } from 'uuid';

import type { DocDocument, DocVersion, File } from '../../../generated/prisma/client.js';
import type { TenantTransaction } from '../../../platform/database/tenant-context.js';
import type { JobQueue } from '../../../platform/queues/job-queue.js';
import { JOBS } from '../../../platform/queues/jobs.js';
import { fromCalendarDate, raisePlainSequence } from '../../core/index.js';
import { controlledCodeSequence, needsRendering, versionLabel } from '../domain/document-rules.js';
import type { FileStorage } from '../infrastructure/file-storage.js';
import { auditDoc, type DocActor } from './doc-support.js';
import type { PreparedEntry } from './import-references.js';
import { requestRender } from './version-rows.js';

// Los pasos de la carga inicial sobre la base de datos (B19, numeral 18.2, pasos 1 a 3): subir el
// archivo por el mismo camino de cualquier archivo (antivirus y huella en el worker), crear el
// documento con su código del listado y su versión de origen «import», y publicarla cuando su PDF
// está listo. La versión ya se aprobó en papel: no tiene trámite ni pide constancia de lectura.

const CHANGE_SUMMARY = 'Carga inicial del Listado Maestro (RE-SGC-001)';

export interface ImportServices {
  readonly storage: Pick<FileStorage, 'put'>;
  readonly queue: Pick<JobQueue, 'add'>;
}

/** El archivo de la carga que aún no es de ninguna versión, si ya se subió. */
export async function pendingSource(
  tx: TenantTransaction,
  actor: DocActor,
  name: string,
): Promise<File | null> {
  return tx.file.findFirst({
    where: { fileName: name, createdBy: actor.userId, deletedAt: null, sourceOf: { none: {} } },
    orderBy: { createdAt: 'desc' },
  });
}

/** Registra el archivo, lo guarda y pide su análisis, como una subida desde la pantalla. */
export async function uploadSource(
  tx: TenantTransaction,
  actor: DocActor,
  services: ImportServices,
  upload: { readonly entry: PreparedEntry; readonly content: Buffer },
): Promise<void> {
  const { entry, content } = upload;
  const id = uuidv7();
  const storageKey = `${actor.tenantId}/${id}`;
  const file = { name: entry.file.name, type: entry.file.type, size: content.length };
  await services.storage.put(
    { key: storageKey, contentType: file.type, sizeBytes: file.size },
    Readable.from(content),
  );
  await tx.file.create({
    data: {
      id,
      tenantId: actor.tenantId,
      storageKey,
      fileName: file.name,
      mimeType: file.type,
      sizeBytes: file.size,
      scanStatus: 'scanning',
    },
  });
  await auditDoc(tx, actor, {
    action: 'doc.file.import',
    entityType: 'doc_document',
    entityId: null,
    changes: { file_id: id, file_name: file.name, code: entry.code },
  });
  await services.queue.add(JOBS.fileScan, {
    tenantId: actor.tenantId,
    userId: actor.userId,
    correlationId: uuidv7(),
    fileId: id,
  });
}

async function linkTargets(
  tx: TenantTransaction,
  actor: DocActor,
  document: DocDocument,
  positionIds: readonly string[],
): Promise<void> {
  if (positionIds.length === 0) return;
  await tx.docLink.createMany({
    data: positionIds.map((entityId) => ({
      tenantId: actor.tenantId,
      documentId: document.id,
      entityType: 'position',
      entityId,
      relation: 'applies_to',
    })),
    skipDuplicates: true,
  });
}

interface ImportTarget {
  readonly entry: PreparedEntry;
  readonly source: File;
}

async function importedRows(
  tx: TenantTransaction,
  actor: DocActor,
  { entry, source }: ImportTarget,
): Promise<{ document: DocDocument; version: DocVersion }> {
  const content = {
    title: entry.title,
    classification: entry.classification,
    ownerPositionId: entry.ownerPositionId,
  };
  const document = await tx.docDocument.create({
    data: {
      tenantId: actor.tenantId,
      folderId: entry.folderId,
      code: entry.code,
      docType: entry.docType,
      processId: entry.processId,
      isControlled: true,
      ...content,
    },
  });
  const rendered = !needsRendering(entry.file.type);
  const version = await tx.docVersion.create({
    data: {
      tenantId: actor.tenantId,
      documentId: document.id,
      number: entry.number,
      versionLabel: versionLabel(entry.number),
      origin: 'import',
      sourceFileId: source.id,
      pdfFileId: rendered ? source.id : null,
      renderStatus: rendered ? 'ready' : 'pending',
      changeSummary: CHANGE_SUMMARY,
      ...content,
    },
  });
  return { document, version };
}

/** El documento con su código del listado y su versión, en borrador hasta tener el PDF. */
export async function createImported(
  tx: TenantTransaction,
  actor: DocActor,
  services: ImportServices,
  target: ImportTarget,
): Promise<DocVersion> {
  const { entry } = target;
  const { document, version } = await importedRows(tx, actor, target);
  await linkTargets(tx, actor, document, entry.targetPositionIds);
  const sequence = controlledCodeSequence(entry.docType, entry.processCode);
  await raisePlainSequence(tx, sequence, Number(entry.code.slice(entry.code.lastIndexOf('-') + 1)));
  await auditDoc(tx, actor, {
    action: 'doc.document.import',
    entityType: 'doc_document',
    entityId: document.id,
    changes: { code: document.code, label: version.versionLabel, row: entry.row },
  });
  await requestRender(services.queue, actor, version);
  return version;
}

/** La versión importada queda vigente desde la fecha del listado, con su PDF ya listo. */
export async function publishImported(
  tx: TenantTransaction,
  actor: DocActor,
  version: DocVersion,
  effectiveDate: string,
): Promise<void> {
  const approvedAt = fromCalendarDate(effectiveDate);
  await tx.docVersion.update({
    where: { id: version.id },
    data: {
      status: 'current',
      submittedAt: actor.at,
      approvedAt,
      publishedAt: actor.at,
      effectiveDate: approvedAt,
    },
  });
  const document = await tx.docDocument.update({
    where: { id: version.documentId },
    data: { status: 'current', currentVersionId: version.id },
  });
  await auditDoc(tx, actor, {
    action: 'doc.version.import',
    entityType: 'doc_version',
    entityId: version.id,
    changes: { code: document.code, label: version.versionLabel, effective_date: effectiveDate },
  });
}

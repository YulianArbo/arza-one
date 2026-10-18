import { allowedFileTypeSchema, type UpdateVersionRequest } from '@arza/contracts';
import { v7 as uuidv7 } from 'uuid';

import type { DocVersion, File } from '../../../generated/prisma/client.js';
import type { TenantTransaction } from '../../../platform/database/tenant-context.js';
import type { JobQueue } from '../../../platform/queues/job-queue.js';
import { JOBS } from '../../../platform/queues/jobs.js';
import { needsRendering, versionLabel } from '../domain/document-rules.js';
import { auditDoc, type DocActor } from './doc-support.js';
import { startVersionFlow } from './version-flow.js';

// Escritura de una versión en borrador (B18), común al documento nuevo y a la versión nueva. Un
// PDF es su propio PDF; Word y Excel quedan «convirtiendo» y el worker los pasa por Gotenberg.
// Desde B19 la versión nace con su trámite de revisión en el motor de flujos.

export interface VersionDraft {
  readonly documentId: string;
  /** Código del documento, para el título del trámite. */
  readonly code: string;
  /** Solicitud de Acción Documental que origina la versión (B19); null fuera del SGC. */
  readonly changeRequestId: string | null;
  readonly number: number;
  readonly input: UpdateVersionRequest;
  readonly source: File;
}

/** Datos de contenido del borrador: el archivo y su PDF, o la espera de la conversión. */
export interface DraftContent {
  readonly title: string;
  readonly classification: string;
  readonly ownerPositionId: string | null;
  readonly changeSummary: string;
  readonly sourceFileId: string;
  readonly pdfFileId: string | null;
  readonly renderStatus: 'ready' | 'pending';
}

export function draftContent(input: UpdateVersionRequest, source: File): DraftContent {
  const rendered = !needsRendering(allowedFileTypeSchema.parse(source.mimeType));
  return {
    title: input.title,
    classification: input.classification,
    ownerPositionId: input.owner_position_id,
    changeSummary: input.change_summary,
    sourceFileId: source.id,
    pdfFileId: rendered ? source.id : null,
    renderStatus: rendered ? 'ready' : 'pending',
  };
}

/** Pide la conversión a PDF dentro de la transacción: si la cola no responde, nada cambia. */
export async function requestRender(
  queue: Pick<JobQueue, 'add'>,
  actor: DocActor,
  version: DocVersion,
): Promise<void> {
  if (version.renderStatus !== 'pending') return;
  await queue.add(JOBS.versionRender, {
    tenantId: actor.tenantId,
    userId: actor.userId,
    correlationId: actor.meta?.correlationId ?? uuidv7(),
    versionId: version.id,
  });
}

export async function createVersionRow(
  tx: TenantTransaction,
  actor: DocActor,
  queue: JobQueue,
  draft: VersionDraft,
): Promise<DocVersion> {
  const version = await tx.docVersion.create({
    data: {
      tenantId: actor.tenantId,
      documentId: draft.documentId,
      number: draft.number,
      versionLabel: versionLabel(draft.number),
      changeRequestId: draft.changeRequestId,
      ...draftContent(draft.input, draft.source),
    },
  });
  await auditDoc(tx, actor, {
    action: 'doc.version.create',
    entityType: 'doc_version',
    entityId: version.id,
    changes: {
      document_id: draft.documentId,
      label: version.versionLabel,
      source_file_id: draft.source.id,
      change_summary: version.changeSummary,
      change_request_id: draft.changeRequestId,
    },
  });
  await startVersionFlow(tx, actor, { version, code: draft.code });
  await requestRender(queue, actor, version);
  return version;
}

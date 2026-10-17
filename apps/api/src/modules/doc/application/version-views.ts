import {
  allowedFileTypeSchema,
  classificationSchema,
  renderStatusSchema,
  versionStatusSchema,
  type Version,
} from '@arza/contracts';

import type { DocVersion, File } from '../../../generated/prisma/client.js';
import type { TenantTransaction } from '../../../platform/database/tenant-context.js';
import { positionsById } from '../../core/index.js';
import { peopleById } from '../../iam/index.js';
import { allowedActions } from '../domain/document-rules.js';
import type { DocReader } from './doc-support.js';

// Vista de las versiones (B18): sus archivos, quién la elaboró y aprobó, y los pasos que la
// persona puede dar. El archivo fuente solo lo ve quien edita documentos.

type VersionFile = Version['pdf_file'];

function fileView(file: File | undefined): VersionFile {
  if (file === undefined) return null;
  return {
    id: file.id,
    file_name: file.fileName,
    mime_type: allowedFileTypeSchema.parse(file.mimeType),
    size_bytes: file.sizeBytes,
    sha256: file.sha256,
  };
}

function iso(date: Date | null): string | null {
  return date === null ? null : date.toISOString();
}

interface VersionLookups {
  readonly files: ReadonlyMap<string, File>;
  readonly people: ReadonlyMap<string, string>;
  readonly positions: Awaited<ReturnType<typeof positionsById>>;
}

async function versionLookups(
  tx: TenantTransaction,
  versions: readonly DocVersion[],
): Promise<VersionLookups> {
  const fileIds = versions.flatMap((v) => [
    v.sourceFileId,
    ...(v.pdfFileId === null ? [] : [v.pdfFileId]),
  ]);
  const files = await tx.file.findMany({ where: { id: { in: [...new Set(fileIds)] } } });
  const personIds = versions.flatMap((v) =>
    [v.createdBy, v.approvedBy].filter((id) => id !== null),
  );
  const people = await peopleById(tx, personIds);
  const positionIds = versions.flatMap((v) =>
    v.ownerPositionId === null ? [] : [v.ownerPositionId],
  );
  return {
    files: new Map(files.map((file) => [file.id, file])),
    people: new Map([...people].map(([id, person]) => [id, person.displayName ?? person.email])),
    positions: await positionsById(tx, positionIds),
  };
}

function person(found: VersionLookups, id: string | null): Version['created_by'] {
  return id === null ? null : { id, name: found.people.get(id) ?? 'Persona retirada' };
}

function versionView(version: DocVersion, found: VersionLookups, reader: DocReader): Version {
  const status = versionStatusSchema.parse(version.status);
  const owner =
    version.ownerPositionId === null ? undefined : found.positions.get(version.ownerPositionId);
  const actor = { ...reader, isAuthor: version.createdBy === reader.userId };
  return {
    id: version.id,
    document_id: version.documentId,
    number: version.number,
    label: version.versionLabel,
    status,
    render_status: renderStatusSchema.parse(version.renderStatus),
    title: version.title,
    classification: classificationSchema.parse(version.classification),
    owner_position: owner === undefined ? null : { id: owner.id, name: owner.name },
    change_summary: version.changeSummary,
    review_note: version.reviewNote,
    source_file: reader.canEdit ? fileView(found.files.get(version.sourceFileId)) : null,
    pdf_file: version.pdfFileId === null ? null : fileView(found.files.get(version.pdfFileId)),
    created_by: person(found, version.createdBy),
    created_at: version.createdAt.toISOString(),
    submitted_at: iso(version.submittedAt),
    approved_by: person(found, version.approvedBy),
    approved_at: iso(version.approvedAt),
    effective_date: version.effectiveDate?.toISOString().slice(0, 10) ?? null,
    published_at: iso(version.publishedAt),
    obsoleted_at: iso(version.obsoletedAt),
    actions: allowedActions({ status, pdfReady: version.renderStatus === 'ready' }, actor),
    version: version.version,
  };
}

export async function versionViews(
  tx: TenantTransaction,
  versions: readonly DocVersion[],
  reader: DocReader,
): Promise<Version[]> {
  const found = await versionLookups(tx, versions);
  return versions.map((version) => versionView(version, found, reader));
}

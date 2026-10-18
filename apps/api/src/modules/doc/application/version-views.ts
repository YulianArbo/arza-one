import {
  allowedFileTypeSchema,
  classificationSchema,
  renderStatusSchema,
  versionOriginSchema,
  versionStatusSchema,
  type Version,
} from '@arza/contracts';

import type { DocVersion, File } from '../../../generated/prisma/client.js';
import type { TenantTransaction } from '../../../platform/database/tenant-context.js';
import { positionsById } from '../../core/index.js';
import { peopleById } from '../../iam/index.js';
import { participationOf, type Participation } from '../../wf/index.js';
import { allowedActions } from '../domain/document-rules.js';
import type { DocReader } from './doc-support.js';

// Vista de las versiones (B18): sus archivos, quién la elaboró y aprobó, y los pasos que la
// persona puede dar. El archivo fuente solo lo ve quien edita documentos. Desde B19, también la
// solicitud que la originó y el paso de su trámite.

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
  readonly requests: ReadonlyMap<string, string>;
  readonly steps: ReadonlyMap<string, Participation>;
}

const IN_PROGRESS = new Set(['draft', 'in_review', 'approved']);

/** El paso del trámite de la versión en trámite, visto por la persona. */
async function stepsOf(
  tx: TenantTransaction,
  versions: readonly DocVersion[],
  reader: DocReader,
  at: Date,
): Promise<Map<string, Participation>> {
  const steps = new Map<string, Participation>();
  for (const version of versions) {
    const instanceId = version.workflowInstanceId;
    if (instanceId === null || !IN_PROGRESS.has(version.status)) continue;
    const step = await participationOf(tx, instanceId, await reader.taskActor(at));
    if (step !== null) steps.set(version.id, step);
  }
  return steps;
}

async function versionLookups(
  tx: TenantTransaction,
  versions: readonly DocVersion[],
  reader: DocReader,
  at: Date,
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
  const requestIds = versions.flatMap((v) =>
    v.changeRequestId === null ? [] : [v.changeRequestId],
  );
  const requests = await tx.docChangeRequest.findMany({
    where: { id: { in: requestIds } },
    select: { id: true, code: true },
  });
  return {
    requests: new Map(requests.map((request) => [request.id, request.code])),
    steps: await stepsOf(tx, versions, reader, at),
    files: new Map(files.map((file) => [file.id, file])),
    people: new Map([...people].map(([id, person]) => [id, person.displayName ?? person.email])),
    positions: await positionsById(tx, positionIds),
  };
}

function person(found: VersionLookups, id: string | null): Version['created_by'] {
  return id === null ? null : { id, name: found.people.get(id) ?? 'Persona retirada' };
}

type FlowFields = Pick<
  Version,
  'origin' | 'change_request' | 'workflow_instance_id' | 'step' | 'actions'
>;

/** La solicitud, el trámite y los pasos que la persona puede dar ahora (B19). */
function flowFields(version: DocVersion, found: VersionLookups, reader: DocReader): FlowFields {
  const step = found.steps.get(version.id);
  const actor = {
    ...reader,
    isAuthor: version.createdBy === reader.userId,
    attendsApproval: step?.attendsApproval ?? false,
    attendsAction: step?.attendsAction ?? false,
  };
  const state = {
    status: versionStatusSchema.parse(version.status),
    pdfReady: version.renderStatus === 'ready',
    step: step?.stateKey ?? null,
  };
  const request = version.changeRequestId;
  return {
    origin: versionOriginSchema.parse(version.origin),
    change_request:
      request === null ? null : { id: request, code: found.requests.get(request) ?? '' },
    workflow_instance_id: version.workflowInstanceId,
    step: step === undefined || step.completed ? null : step.stateLabel,
    actions: allowedActions(state, actor),
  };
}

function versionView(version: DocVersion, found: VersionLookups, reader: DocReader): Version {
  const status = versionStatusSchema.parse(version.status);
  const owner =
    version.ownerPositionId === null ? undefined : found.positions.get(version.ownerPositionId);
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
    ...flowFields(version, found, reader),
    version: version.version,
  };
}

export async function versionViews(
  tx: TenantTransaction,
  versions: readonly DocVersion[],
  reader: DocReader,
  at: Date,
): Promise<Version[]> {
  const found = await versionLookups(tx, versions, reader, at);
  return versions.map((version) => versionView(version, found, reader));
}

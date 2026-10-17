import {
  classificationSchema,
  documentStatusSchema,
  versionStatusSchema,
  type Document,
} from '@arza/contracts';

import type { DocDocument, DocVersion } from '../../../generated/prisma/client.js';
import type { TenantTransaction } from '../../../platform/database/tenant-context.js';
import { catalogLabels, orgUnitsById, positionsById } from '../../core/index.js';
import { OPEN_STATUSES } from '../domain/document-rules.js';
import { DOCUMENT_TYPES_CATALOG } from './doc-references.js';

// Vista de los documentos (B18): cada uno con su tipo, proceso, cargo responsable y las versiones
// vigente y en trámite, consultadas en bloque para toda la página.

type VersionReference = Document['current_version'];

function versionReference(version: DocVersion | undefined): VersionReference {
  if (version === undefined) return null;
  return {
    id: version.id,
    label: version.versionLabel,
    status: versionStatusSchema.parse(version.status),
    effective_date: version.effectiveDate?.toISOString().slice(0, 10) ?? null,
  };
}

interface Lookups {
  readonly types: ReadonlyMap<string, string>;
  readonly processes: Awaited<ReturnType<typeof orgUnitsById>>;
  readonly positions: Awaited<ReturnType<typeof positionsById>>;
  readonly current: ReadonlyMap<string, DocVersion>;
  readonly open: ReadonlyMap<string, DocVersion>;
}

/** Las versiones vigente y en trámite de los documentos, por documento. */
async function keyVersions(tx: TenantTransaction, documents: readonly DocDocument[]) {
  const currentIds = documents.flatMap((doc) =>
    doc.currentVersionId === null ? [] : [doc.currentVersionId],
  );
  const versions = await tx.docVersion.findMany({
    where: {
      deletedAt: null,
      OR: [
        { id: { in: currentIds } },
        { documentId: { in: documents.map((doc) => doc.id) }, status: { in: [...OPEN_STATUSES] } },
      ],
    },
  });
  const current = new Map(
    versions.filter((v) => currentIds.includes(v.id)).map((v) => [v.documentId, v]),
  );
  const open = new Map(
    versions.filter((v) => OPEN_STATUSES.some((s) => s === v.status)).map((v) => [v.documentId, v]),
  );
  return { current, open };
}

async function lookups(tx: TenantTransaction, documents: readonly DocDocument[]): Promise<Lookups> {
  const processIds = documents.flatMap((doc) => (doc.processId === null ? [] : [doc.processId]));
  const positionIds = documents.flatMap((doc) =>
    doc.ownerPositionId === null ? [] : [doc.ownerPositionId],
  );
  return {
    types: await catalogLabels(tx, DOCUMENT_TYPES_CATALOG),
    processes: await orgUnitsById(tx, processIds),
    positions: await positionsById(tx, positionIds),
    ...(await keyVersions(tx, documents)),
  };
}

function documentView(doc: DocDocument, found: Lookups, showOpen: boolean): Document {
  const process = doc.processId === null ? undefined : found.processes.get(doc.processId);
  const owner = doc.ownerPositionId === null ? undefined : found.positions.get(doc.ownerPositionId);
  return {
    id: doc.id,
    code: doc.code,
    title: doc.title,
    doc_type: doc.docType,
    doc_type_label: found.types.get(doc.docType) ?? doc.docType,
    is_controlled: doc.isControlled,
    process:
      process === undefined ? null : { id: process.id, code: process.code, name: process.name },
    folder_id: doc.folderId,
    classification: classificationSchema.parse(doc.classification),
    owner_position: owner === undefined ? null : { id: owner.id, name: owner.name },
    status: documentStatusSchema.parse(doc.status),
    current_version: versionReference(found.current.get(doc.id)),
    open_version: showOpen ? versionReference(found.open.get(doc.id)) : null,
    created_at: doc.createdAt.toISOString(),
    version: doc.version,
  };
}

/**
 * Documentos para mostrar. La versión en trámite solo se muestra a quien puede verla: quien ve
 * todo o quien creó el documento.
 */
export async function documentViews(
  tx: TenantTransaction,
  documents: readonly DocDocument[],
  seesOpen: (doc: DocDocument) => boolean,
): Promise<Document[]> {
  const found = await lookups(tx, documents);
  return documents.map((doc) => documentView(doc, found, seesOpen(doc)));
}

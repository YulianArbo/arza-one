import type { DocVersion } from '../../../generated/prisma/client.js';
import type { Clock } from '../../../platform/clock/clock.js';
import type { DatabaseService } from '../../../platform/database/database.service.js';
import type { TenantTransaction } from '../../../platform/database/tenant-context.js';
import { parseCsv } from '../../../platform/export/csv-read.js';
import { readListing, type RowProblem } from '../domain/master-list-listing.js';
import {
  differences,
  type Difference,
  type PlatformEntry,
} from '../domain/master-list-reconcile.js';
import { auditDoc, type DocActor } from './doc-support.js';
import { prepareEntries, type ImportFiles, type PreparedEntry } from './import-references.js';
import {
  createImported,
  pendingSource,
  publishImported,
  uploadSource,
  type ImportServices,
} from './import-rows.js';

// Carga inicial del Listado Maestro RE-SGC-001 (B19, numeral 18.2, pasos 1 a 3). Sin «aplicar»
// solo revisa el listado y la carpeta y entrega el informe. Al aplicar, avanza cada documento lo
// que se pueda en esta corrida: sube su archivo, crea el documento cuando el antivirus lo aprobó y
// lo publica cuando su PDF está listo. Se puede correr varias veces: nada se duplica y cada corrida
// termina lo pendiente. Al final compara la plataforma con el listado.

export interface ImportDependencies extends ImportServices {
  readonly database: Pick<DatabaseService, 'withTenant'>;
  readonly clock: Clock;
}

export interface ImportRequest {
  readonly tenantId: string;
  /** Quien hace la carga (Calidad): queda como autor en la auditoría. */
  readonly userId: string;
  readonly listing: string;
  readonly files: ImportFiles;
  readonly apply: boolean;
}

export interface ImportReport {
  readonly listed: number;
  readonly skipped: readonly RowProblem[];
  readonly problems: readonly RowProblem[];
  readonly uploaded: number;
  readonly created: number;
  readonly published: number;
  readonly current: number;
  /** Documentos que esperan el antivirus o su PDF: otra corrida los termina. */
  readonly waiting: number;
  readonly differences: readonly Difference[];
}

type Outcome = 'uploaded' | 'created' | 'published' | 'current' | 'waiting' | RowProblem;

interface Run {
  readonly deps: ImportDependencies;
  readonly request: ImportRequest;
}

function actorOf(run: Run): DocActor {
  return {
    tenantId: run.request.tenantId,
    userId: run.request.userId,
    meta: null,
    at: run.deps.clock.now(),
  };
}

function inTenant<T>(run: Run, work: (tx: TenantTransaction) => Promise<T>): Promise<T> {
  return run.deps.database.withTenant(
    { tenantId: run.request.tenantId, userId: run.request.userId },
    work,
  );
}

/** La versión cargada del documento, si el documento ya existe. */
async function importedVersion(
  tx: TenantTransaction,
  code: string,
): Promise<DocVersion | 'other' | null> {
  const document = await tx.docDocument.findFirst({ where: { code, deletedAt: null } });
  if (document === null) return null;
  const version = await tx.docVersion.findFirst({
    where: { documentId: document.id, origin: 'import' },
  });
  return version ?? 'other';
}

/** El documento cargado: publicarlo si su PDF está listo, o seguir esperando. */
async function advanceVersion(
  run: Run,
  entry: PreparedEntry,
  version: DocVersion,
): Promise<Outcome> {
  if (version.status !== 'draft') return 'current';
  if (version.renderStatus === 'failed') {
    return { row: entry.row, code: entry.code, problem: 'no se pudo convertir el archivo a PDF' };
  }
  if (version.renderStatus !== 'ready') return 'waiting';
  await inTenant(run, (tx) => publishImported(tx, actorOf(run), version, entry.effectiveDate));
  return 'published';
}

/** El documento aún no existe: su archivo se sube o, ya aprobado, se crea el documento. */
async function advanceSource(run: Run, entry: PreparedEntry): Promise<Outcome> {
  const actor = actorOf(run);
  const source = await inTenant(run, (tx) => pendingSource(tx, actor, entry.file.name));
  if (source === null || source.scanStatus === 'rejected') {
    const content = await run.request.files.read(entry.file.name);
    await inTenant(run, (tx) => uploadSource(tx, actor, run.deps, { entry, content }));
    return source === null
      ? 'uploaded'
      : {
          row: entry.row,
          code: entry.code,
          problem: `el archivo fue rechazado (${source.rejection ?? ''}); se subió de nuevo`,
        };
  }
  if (source.scanStatus !== 'available') return 'waiting';
  const version = await inTenant(run, (tx) =>
    createImported(tx, actor, run.deps, { entry, source }),
  );
  const next = await advanceVersion(run, entry, version);
  return next === 'published' ? 'published' : 'created';
}

async function advance(run: Run, entry: PreparedEntry): Promise<Outcome> {
  const version = await inTenant(run, (tx) => importedVersion(tx, entry.code));
  if (version === 'other') return 'current';
  if (version === null) return advanceSource(run, entry);
  return advanceVersion(run, entry, version);
}

/** Los documentos del SGC como están en la plataforma, para conciliar. */
async function platformEntries(tx: TenantTransaction): Promise<PlatformEntry[]> {
  const documents = await tx.docDocument.findMany({
    where: { isControlled: true, deletedAt: null },
  });
  const ids = documents.flatMap((doc) =>
    doc.currentVersionId === null ? [] : [doc.currentVersionId],
  );
  const versions = new Map(
    (await tx.docVersion.findMany({ where: { id: { in: ids } } })).map((v) => [v.id, v]),
  );
  return documents.map((doc) => {
    const current = doc.currentVersionId === null ? undefined : versions.get(doc.currentVersionId);
    return {
      code: doc.code,
      title: doc.title,
      versionLabel: current?.versionLabel ?? null,
      effectiveDate: current?.effectiveDate?.toISOString().slice(0, 10) ?? null,
      status: doc.status,
    };
  });
}

function tally(outcomes: readonly Outcome[]) {
  const count = (kind: string) => outcomes.filter((outcome) => outcome === kind).length;
  return {
    uploaded: count('uploaded'),
    created: count('created'),
    published: count('published'),
    current: count('current') + count('published'),
    waiting: count('waiting') + count('uploaded') + count('created'),
    problems: outcomes.filter((outcome): outcome is RowProblem => typeof outcome !== 'string'),
  };
}

async function recordRun(run: Run, report: ImportReport): Promise<void> {
  await inTenant(run, (tx) =>
    auditDoc(tx, actorOf(run), {
      action: 'doc.import.run',
      entityType: 'doc_document',
      entityId: null,
      changes: {
        listed: report.listed,
        uploaded: report.uploaded,
        created: report.created,
        published: report.published,
        waiting: report.waiting,
        problems: report.problems.length,
        differences: report.differences.length,
      },
    }),
  );
}

/** Revisa (y, si se pide, aplica) la carga del listado y entrega el informe. */
export async function importMasterList(
  deps: ImportDependencies,
  request: ImportRequest,
): Promise<ImportReport> {
  const run = { deps, request };
  const listing = readListing(parseCsv(request.listing));
  const { prepared, problems } = await inTenant(run, (tx) =>
    prepareEntries(tx, listing.entries, request.files),
  );
  const outcomes: Outcome[] = [];
  if (request.apply) for (const entry of prepared) outcomes.push(await advance(run, entry));
  const { problems: stepProblems, ...counts } = tally(outcomes);
  const report: ImportReport = {
    listed: listing.entries.length + listing.problems.filter((p) => p.row > 1).length,
    skipped: listing.skipped,
    problems: [...listing.problems, ...problems, ...stepProblems],
    ...counts,
    differences: differences(listing.entries, await inTenant(run, platformEntries)),
  };
  if (request.apply) await recordRun(run, report);
  return report;
}

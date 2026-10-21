import type { Clock } from '../../../platform/clock/clock.js';
import type { DatabaseService } from '../../../platform/database/database.service.js';
import type { FileStorage } from '../infrastructure/file-storage.js';
import { MAX_TEXT_CHARS } from '../infrastructure/pdf-text.js';
import { auditDoc } from './doc-support.js';
import { systemActor } from './generated-pdf.js';

// Texto de las versiones vigentes para la búsqueda (B21, numeral 13.2): el worker lee el PDF de
// cada versión vigente que aún no lo tiene y lo guarda en doc_version_texts, donde la base de datos
// lo indexa en español y sin tildes. Repetirlo no cambia nada; un PDF que no se pudo leer queda
// «failed» y se busca solo por su código y su título.

export interface TextExtractionDependencies {
  readonly database: Pick<DatabaseService, 'withTenant' | 'withoutTenant'>;
  readonly clock: Clock;
  readonly storage: Pick<FileStorage, 'read'>;
  readonly extractText: (pdf: Buffer) => Promise<string>;
}

interface Extracted {
  readonly status: 'ready' | 'empty' | 'failed';
  readonly content: string;
}

/** Cuántas versiones toma por empresa en cada pasada; las demás, en la siguiente. */
const BATCH = 10;

async function extracted(deps: TextExtractionDependencies, storageKey: string): Promise<Extracted> {
  try {
    const content = (await deps.extractText(await deps.storage.read(storageKey))).slice(
      0,
      MAX_TEXT_CHARS,
    );
    return { status: content === '' ? 'empty' : 'ready', content };
  } catch {
    return { status: 'failed', content: '' };
  }
}

async function pendingOf(deps: TextExtractionDependencies, tenantId: string) {
  return deps.database.withTenant({ tenantId, userId: null }, (tx) =>
    tx.docVersion.findMany({
      where: {
        status: 'current',
        deletedAt: null,
        text: { is: null },
        pdfFile: { is: { scanStatus: 'available' } },
      },
      select: { id: true, documentId: true, pdfFile: { select: { storageKey: true } } },
      orderBy: { id: 'asc' },
      take: BATCH,
    }),
  );
}

/** Extrae el texto pendiente de una empresa. Devuelve cuántas versiones guardó. */
async function extractTenantTexts(
  deps: TextExtractionDependencies,
  tenantId: string,
): Promise<number> {
  let saved = 0;
  for (const version of await pendingOf(deps, tenantId)) {
    if (version.pdfFile === null) continue;
    const text = await extracted(deps, version.pdfFile.storageKey);
    const at = deps.clock.now();
    const stored = await deps.database.withTenant({ tenantId, userId: null }, async (tx) => {
      const { count } = await tx.docVersionText.createMany({
        data: [{ tenantId, documentId: version.documentId, versionId: version.id, ...text }],
        skipDuplicates: true,
      });
      if (count === 0) return false;
      await auditDoc(tx, systemActor(tenantId, at), {
        action: 'doc.version.text',
        entityType: 'doc_version',
        entityId: version.id,
        changes: { status: text.status, characters: text.content.length },
      });
      return true;
    });
    if (stored) saved += 1;
  }
  return saved;
}

/** Trabajo del worker: el texto pendiente de todas las empresas. */
export async function extractPendingTexts(deps: TextExtractionDependencies): Promise<number> {
  const tenants = await deps.database.withoutTenant(
    (tx) => tx.$queryRaw<{ id: string }[]>`SELECT doc_tenants_with_pending_texts() AS id`,
  );
  let saved = 0;
  for (const { id } of tenants) saved += await extractTenantTexts(deps, id);
  return saved;
}

import type { AppAbility } from '../../../platform/access/ability.js';
import type { Principal } from '../../../platform/access/principal.js';
import type { DatabaseService } from '../../../platform/database/database.service.js';
import type { TenantTransaction } from '../../../platform/database/tenant-context.js';
import { anyOfTerms } from '../domain/search-terms.js';
import { readerOf, visibleDocuments } from './doc-support.js';
import { candidates } from './document-search.js';

// Lo que el asistente de IA (B47) puede leer de Gestión documental. Solo documentos vigentes que
// la persona puede abrir, con la misma regla del módulo (visibleDocuments), y nunca uno restringido,
// aunque la persona pueda verlo (decisión 9). El asistente nunca lee las tablas doc_.

/** Clases que el asistente puede recibir (numeral 12.4); lo restringido queda siempre por fuera. */
const ALLOWED = ['public', 'internal', 'confidential'] as const;

export interface AssistantDocument {
  readonly id: string;
  readonly code: string;
  readonly title: string;
  readonly classification: 'public' | 'internal' | 'confidential';
  readonly versionId: string;
}

export interface IndexableVersion {
  readonly documentId: string;
  readonly versionId: string;
  readonly classification: 'public' | 'internal' | 'confidential';
}

function allowedClass(value: string): AssistantDocument['classification'] | null {
  return ALLOWED.find((allowed) => allowed === value) ?? null;
}

function assistantView(doc: {
  id: string;
  code: string;
  title: string;
  classification: string;
  currentVersionId: string | null;
}): AssistantDocument | null {
  const classification = allowedClass(doc.classification);
  if (classification === null || doc.currentVersionId === null) return null;
  const { id, code, title, currentVersionId: versionId } = doc;
  return { id, code, title, classification, versionId };
}

const VIEW_FIELDS = {
  id: true,
  code: true,
  title: true,
  classification: true,
  currentVersionId: true,
} as const;

/**
 * Documentos vigentes que coinciden con alguna de las palabras clave y que la persona puede abrir,
 * del más al menos relacionado.
 */
export async function assistantCandidates(
  tx: TenantTransaction,
  viewer: { readonly principal: Principal; readonly ability: AppAbility },
  keywords: readonly string[],
  limit: number,
): Promise<AssistantDocument[]> {
  const query = anyOfTerms(keywords);
  if (query === null) return [];
  const found = await candidates(tx, query, null);
  const rank = new Map(found.map((candidate) => [candidate.id, candidate.rank]));
  const reader = await readerOf(tx, viewer.principal, viewer.ability);
  const visible = await tx.docDocument.findMany({
    where: {
      AND: [
        { id: { in: [...rank.keys()] } },
        { status: 'current', classification: { in: [...ALLOWED] } },
        visibleDocuments(reader),
      ],
    },
    select: VIEW_FIELDS,
  });
  return visible
    .sort((a, b) => (rank.get(b.id) ?? 0) - (rank.get(a.id) ?? 0) || a.code.localeCompare(b.code))
    .flatMap((doc) => assistantView(doc) ?? [])
    .slice(0, limit);
}

/**
 * Un documento vigente que la persona puede abrir, con su texto (null si aún no se extrajo).
 * Devuelve «excluded» si es restringido y null si la persona no lo ve o no existe.
 */
export async function assistantDocument(
  tx: TenantTransaction,
  viewer: { readonly principal: Principal; readonly ability: AppAbility },
  id: string,
): Promise<
  { readonly document: AssistantDocument; readonly text: string | null } | 'excluded' | null
> {
  const reader = await readerOf(tx, viewer.principal, viewer.ability);
  const doc = await tx.docDocument.findFirst({
    where: { AND: [{ id, status: 'current' }, visibleDocuments(reader)] },
    select: VIEW_FIELDS,
  });
  if (doc === null) return null;
  const document = assistantView(doc);
  if (document === null) return doc.classification === 'restricted' ? 'excluded' : null;
  return { document, text: await versionText(tx, document.versionId) };
}

/** Texto extraído de una versión; null si no está listo. */
export async function versionText(
  tx: TenantTransaction,
  versionId: string,
): Promise<string | null> {
  const text = await tx.docVersionText.findFirst({
    where: { versionId, status: 'ready', deletedAt: null },
    select: { content: true },
  });
  return text?.content ?? null;
}

/** Versiones vigentes, no restringidas y con texto listo: lo que el asistente puede indexar. */
export async function indexableVersions(tx: TenantTransaction): Promise<IndexableVersion[]> {
  const rows = await tx.docVersionText.findMany({
    where: {
      status: 'ready',
      deletedAt: null,
      document: {
        deletedAt: null,
        status: 'current',
        classification: { in: [...ALLOWED] },
      },
    },
    select: {
      versionId: true,
      documentId: true,
      document: { select: { currentVersionId: true, classification: true } },
    },
  });
  return rows.flatMap((row) => {
    const classification = allowedClass(row.document.classification);
    if (classification === null || row.document.currentVersionId !== row.versionId) return [];
    return [{ documentId: row.documentId, versionId: row.versionId, classification }];
  });
}

/** Empresas con textos listos, para el trabajo de indexación del worker. */
export async function tenantsWithReadyTexts(
  database: Pick<DatabaseService, 'withoutTenant'>,
): Promise<string[]> {
  const rows = await database.withoutTenant(
    (tx) => tx.$queryRaw<{ id: string }[]>`SELECT doc_tenants_with_ready_texts() AS id`,
  );
  return rows.map((row) => row.id);
}

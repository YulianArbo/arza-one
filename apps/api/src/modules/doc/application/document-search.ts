import { Inject, Injectable } from '@nestjs/common';
import {
  classificationSchema,
  documentStatusSchema,
  type DocumentSearchQuery,
  type DocumentSearchResponse,
} from '@arza/contracts';

import type { DocDocument } from '../../../generated/prisma/client.js';
import type { AppAbility } from '../../../platform/access/ability.js';
import type { Principal } from '../../../platform/access/principal.js';
import { DatabaseService } from '../../../platform/database/database.service.js';
import type { TenantTransaction } from '../../../platform/database/tenant-context.js';
import { searchTerms } from '../domain/search-terms.js';
import { readerOf, visibleDocuments } from './doc-support.js';

// Búsqueda de texto completo (B21, numeral 13.2): en español y sin tildes, sobre el código, el
// título y el texto de la versión vigente (doc_version_texts). Primero la base de datos ordena los
// documentos que coinciden; después se quedan solo los que la persona puede abrir, con la misma
// regla del resto del módulo (visibleDocuments). Así la búsqueda nunca muestra otra cosa.

/** Cuántos documentos que coinciden se revisan contra los permisos, de los más relacionados. */
const CANDIDATES = 500;

/** Fragmento con las palabras encontradas entre [[ y ]], de unas 10 a 25 palabras. */
const HEADLINE =
  'StartSel=[[, StopSel=]], MinWords=10, MaxWords=25, MaxFragments=1, FragmentDelimiter=" … "';

interface Candidate {
  readonly id: string;
  readonly rank: number;
}

/** Los documentos que coinciden, del más al menos relacionado; el código pesa más que el texto. */
async function candidates(
  tx: TenantTransaction,
  query: string,
  codePrefix: string | null,
): Promise<Candidate[]> {
  return tx.$queryRaw<Candidate[]>`
    WITH q AS (SELECT to_tsquery('doc_spanish', ${query}) AS query)
    SELECT id, max(rank)::float8 AS rank FROM (
        SELECT d.id, ts_rank(to_tsvector('doc_spanish', d.code || ' ' || d.title), q.query) + 1 AS rank
        FROM doc_documents d, q
        WHERE to_tsvector('doc_spanish', d.code || ' ' || d.title) @@ q.query
        UNION ALL
        SELECT t.document_id, ts_rank(to_tsvector('doc_spanish', t.content), q.query) AS rank
        FROM doc_version_texts t
        JOIN doc_documents d ON d.tenant_id = t.tenant_id AND d.current_version_id = t.version_id
        CROSS JOIN q
        WHERE t.status = 'ready' AND to_tsvector('doc_spanish', t.content) @@ q.query
        UNION ALL
        SELECT d.id, 2 AS rank FROM doc_documents d
        WHERE ${codePrefix}::text IS NOT NULL AND d.code LIKE ${codePrefix}::text || '%'
    ) found
    GROUP BY id
    ORDER BY rank DESC, id
    LIMIT ${CANDIDATES}`;
}

/** El fragmento del texto vigente de cada documento que coincide. */
async function snippets(
  tx: TenantTransaction,
  query: string,
  documentIds: readonly string[],
): Promise<Map<string, string>> {
  if (documentIds.length === 0) return new Map();
  const rows = await tx.$queryRaw<{ id: string; snippet: string }[]>`
    WITH q AS (SELECT to_tsquery('doc_spanish', ${query}) AS query)
    SELECT d.id, ts_headline('doc_spanish', t.content, q.query, ${HEADLINE}) AS snippet
    FROM doc_documents d
    JOIN doc_version_texts t ON t.tenant_id = d.tenant_id AND t.version_id = d.current_version_id
    CROSS JOIN q
    WHERE d.id = ANY(${[...documentIds]}::uuid[]) AND t.status = 'ready'
        AND to_tsvector('doc_spanish', t.content) @@ q.query`;
  return new Map(rows.map((row) => [row.id, row.snippet]));
}

/** Los resultados con su fragmento; lo restringido nunca muestra su texto en la búsqueda. */
async function hits(
  tx: TenantTransaction,
  query: string,
  page: readonly DocDocument[],
): Promise<DocumentSearchResponse['data']> {
  const withText = page.filter((doc) => doc.classification !== 'restricted').map((d) => d.id);
  const texts = await snippets(tx, query, withText);
  return page.map((doc) => ({
    id: doc.id,
    code: doc.code,
    title: doc.title,
    doc_type: doc.docType,
    classification: classificationSchema.parse(doc.classification),
    status: documentStatusSchema.parse(doc.status),
    snippet: texts.get(doc.id) ?? null,
  }));
}

@Injectable()
export class DocumentSearchUseCase {
  constructor(@Inject(DatabaseService) private readonly database: DatabaseService) {}

  async search(
    principal: Principal,
    ability: AppAbility,
    input: DocumentSearchQuery,
  ): Promise<DocumentSearchResponse> {
    const terms = searchTerms(input.q);
    // Un texto con forma de código siempre trae palabras: sin palabras no hay nada que buscar.
    const { query, codePrefix } = terms;
    if (query === null) return { data: [] };
    return this.database.withTenant(principal, async (tx) => {
      const reader = await readerOf(tx, principal, ability);
      const found = await candidates(tx, query, codePrefix);
      const rank = new Map(found.map((candidate) => [candidate.id, candidate.rank]));
      const visible = await tx.docDocument.findMany({
        where: {
          AND: [
            { id: { in: [...rank.keys()] } },
            { status: { not: 'disposed' } },
            visibleDocuments(reader),
          ],
        },
      });
      const page = visible
        .sort(
          (a, b) => (rank.get(b.id) ?? 0) - (rank.get(a.id) ?? 0) || a.code.localeCompare(b.code),
        )
        .slice(0, input.limit);
      return { data: await hits(tx, query, page) };
    });
  }
}

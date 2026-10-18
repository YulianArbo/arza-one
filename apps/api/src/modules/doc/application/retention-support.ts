import type { TenantTransaction } from '../../../platform/database/tenant-context.js';

// Retención de los documentos (B21, numeral 12.4) con las funciones de la base de datos, que son
// la única definición: qué regla se aplica (doc_retention_rule_of), desde cuándo corre el plazo
// (doc_retention_base_on) y cuándo vence (doc_retention_due_on). Los disparadores usan las mismas.

export interface RetentionFacts {
  readonly ruleId: string | null;
  readonly baseOn: string | null;
  readonly dueOn: string | null;
}

/** La regla, la fecha base y el vencimiento de cada documento, por identificador. */
export async function retentionFacts(
  tx: TenantTransaction,
  documentIds: readonly string[],
): Promise<Map<string, RetentionFacts>> {
  if (documentIds.length === 0) return new Map();
  const rows = await tx.$queryRaw<(RetentionFacts & { documentId: string })[]>`
    SELECT d.id AS "documentId", doc_retention_rule_of(d) AS "ruleId",
           doc_retention_base_on(d)::text AS "baseOn", doc_retention_due_on(d)::text AS "dueOn"
    FROM doc_documents d
    WHERE d.id = ANY(${[...documentIds]}::uuid[])`;
  return new Map(rows.map(({ documentId, ...facts }) => [documentId, facts]));
}

export interface ExpiredDocument {
  readonly documentId: string;
  readonly ruleId: string;
  readonly dueOn: string;
}

/**
 * Documentos cuya regla dice eliminar y ya venció, que no están en otra propuesta (una rechazada
 * no cuenta; uno que Calidad decidió conservar no se vuelve a proponer). En orden de código.
 */
export async function expiredDocuments(
  tx: TenantTransaction,
  today: string,
): Promise<ExpiredDocument[]> {
  return tx.$queryRaw<ExpiredDocument[]>`
    SELECT d.id AS "documentId", r.id AS "ruleId", facts.due_on::text AS "dueOn"
    FROM doc_documents d
    CROSS JOIN LATERAL (SELECT doc_retention_rule_of(d) AS rule_id,
                               doc_retention_due_on(d) AS due_on) facts
    JOIN doc_retention_rules r ON r.tenant_id = d.tenant_id AND r.id = facts.rule_id
    WHERE d.deleted_at IS NULL AND d.status IN ('current', 'obsolete')
        AND r.disposition = 'destroy' AND facts.due_on <= ${today}::date
        AND NOT EXISTS (
            SELECT 1 FROM doc_dispositions i
            JOIN doc_disposition_proposals p ON p.tenant_id = i.tenant_id AND p.id = i.proposal_id
            WHERE i.tenant_id = d.tenant_id AND i.document_id = d.id AND i.deleted_at IS NULL
                AND p.status <> 'rejected')
    ORDER BY d.code`;
}

/** Cuántos documentos (sin eliminar) toma cada regla; la llave null cuenta los que no tienen. */
export async function documentsPerRule(tx: TenantTransaction): Promise<Map<string | null, number>> {
  const rows = await tx.$queryRaw<{ ruleId: string | null; total: number }[]>`
    SELECT doc_retention_rule_of(d) AS "ruleId", count(*)::int AS total
    FROM doc_documents d
    WHERE d.deleted_at IS NULL AND d.status <> 'disposed'
    GROUP BY 1`;
  return new Map(rows.map((row) => [row.ruleId, row.total]));
}

/** Los primeros documentos sin regla, en orden de código. */
export async function documentsWithoutRule(
  tx: TenantTransaction,
  limit: number,
): Promise<{ id: string; code: string; title: string; docType: string }[]> {
  return tx.$queryRaw`
    SELECT d.id, d.code, d.title, d.doc_type AS "docType"
    FROM doc_documents d
    WHERE d.deleted_at IS NULL AND d.status <> 'disposed' AND doc_retention_rule_of(d) IS NULL
    ORDER BY d.code
    LIMIT ${limit}`;
}

import type { Clock } from '../../../platform/clock/clock.js';
import type { DatabaseService } from '../../../platform/database/database.service.js';
import type { TenantTransaction } from '../../../platform/database/tenant-context.js';
import { activeProcesses, catalogLabels } from '../../core/index.js';
import {
  readRetentionTable,
  type RetentionTableProblem,
  type RetentionTableRow,
} from '../domain/retention-table.js';
import { DOCUMENT_TYPES_CATALOG } from './doc-references.js';
import { auditDoc, type DocActor } from './doc-support.js';

// Carga de la Tabla de Retención RE-SGC-005 (B21, numeral 18.2, paso 4) desde su CSV. Sin
// «aplicar» solo revisa: cada fila con problemas queda en el informe. Con «aplicar» y sin
// problemas crea las reglas que faltan, todas en una transacción; las que ya existen (por su
// código) no se tocan. Repetirla no duplica nada.

export interface RetentionImportRequest {
  readonly tenantId: string;
  readonly userId: string;
  readonly csv: string;
  readonly apply: boolean;
}

export interface RetentionImportReport {
  readonly read: number;
  readonly created: readonly string[];
  readonly existing: readonly string[];
  readonly problems: readonly RetentionTableProblem[];
}

interface Company {
  readonly types: ReadonlySet<string>;
  readonly processes: ReadonlyMap<string, string>;
  readonly codes: ReadonlySet<string>;
}

async function companyOf(tx: TenantTransaction): Promise<Company> {
  const rules = await tx.docRetentionRule.findMany({ select: { code: true } });
  return {
    types: new Set((await catalogLabels(tx, DOCUMENT_TYPES_CATALOG)).keys()),
    processes: new Map((await activeProcesses(tx)).map((process) => [process.code, process.id])),
    codes: new Set(rules.map((rule) => rule.code)),
  };
}

/** Lo que la fila pide y la empresa no tiene; null si todo existe. */
function companyProblem(row: RetentionTableRow, company: Company): string | null {
  if (row.rule.doc_type !== null && !company.types.has(row.rule.doc_type)) {
    return `el tipo ${row.rule.doc_type} no está en el catálogo de tipos de documento`;
  }
  if (row.processCode !== null && !company.processes.has(row.processCode)) {
    return `el proceso ${row.processCode} no existe o no está activo`;
  }
  return null;
}

async function createRules(
  tx: TenantTransaction,
  actor: DocActor,
  rows: readonly RetentionTableRow[],
  company: Company,
): Promise<void> {
  for (const { rule, processCode } of rows) {
    const created = await tx.docRetentionRule.create({
      data: {
        tenantId: actor.tenantId,
        code: rule.code,
        name: rule.name,
        docType: rule.doc_type,
        processId: processCode === null ? null : (company.processes.get(processCode) ?? null),
        activeYears: rule.active_years,
        archiveYears: rule.archive_years,
        disposition: rule.disposition,
        legalBasis: rule.legal_basis,
      },
    });
    await auditDoc(tx, actor, {
      action: 'doc.retention_rule.create',
      entityType: 'doc_retention_rule',
      entityId: created.id,
      changes: { code: rule.code, name: rule.name, source: 'RE-SGC-005' },
    });
  }
}

/** Lo que se hará: las filas con problemas y, si se puede cargar, los códigos nuevos. */
function reportOf(
  table: ReturnType<typeof readRetentionTable>,
  company: Company,
  apply: boolean,
): RetentionImportReport {
  const problems = [...table.problems];
  for (const row of table.rows) {
    const problem = companyProblem(row, company);
    if (problem !== null) problems.push({ row: row.row, code: row.rule.code, problem });
  }
  const isNew = (row: RetentionTableRow) => !company.codes.has(row.rule.code);
  return {
    read: table.rows.length + table.problems.length,
    created: problems.length === 0 && apply ? table.rows.filter(isNew).map((r) => r.rule.code) : [],
    existing: table.rows.filter((row) => !isNew(row)).map((row) => row.rule.code),
    problems: problems.sort((a, b) => a.row - b.row),
  };
}

export async function importRetentionTable(
  deps: { readonly database: Pick<DatabaseService, 'withTenant'>; readonly clock: Clock },
  request: RetentionImportRequest,
): Promise<RetentionImportReport> {
  const table = readRetentionTable(request.csv);
  const actor = {
    tenantId: request.tenantId,
    userId: request.userId,
    meta: null,
    at: deps.clock.now(),
  };
  return deps.database.withTenant(request, async (tx) => {
    const company = await companyOf(tx);
    const report = reportOf(table, company, request.apply);
    const fresh = table.rows.filter((row) => !company.codes.has(row.rule.code));
    if (report.created.length === 0) return report;
    await createRules(tx, actor, fresh, company);
    await auditDoc(tx, actor, {
      action: 'doc.retention_rule.import',
      entityType: 'doc_retention_rule',
      entityId: null,
      changes: {
        read: report.read,
        created: report.created.length,
        existing: report.existing.length,
      },
    });
    return report;
  });
}

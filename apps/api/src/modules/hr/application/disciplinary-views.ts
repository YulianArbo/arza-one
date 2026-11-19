import {
  disciplinaryCaseSchema,
  disciplinarySummarySchema,
  ownDisciplinaryCaseSchema,
  type DisciplinaryCase,
  type DisciplinarySummary,
  type OwnDisciplinaryCase,
} from '@arza/contracts';

import type { HrDisciplinaryCase } from '../../../generated/prisma/client.js';
import type { FieldCipher } from '../../../platform/crypto/field-cipher.js';
import type { TenantTransaction } from '../../../platform/database/tenant-context.js';
import { toCalendarDate } from '../../core/index.js';
import { employeeRefsById } from './hr-support.js';

// Lo que se muestra de un proceso disciplinario (B36, decisión 8). Los hechos, los descargos y la
// motivación van cifrados en la base: se descifran solo para quien puede verlos, y cada lectura
// queda registrada en la auditoría (numeral 12.4, información restringida).

/** El contexto ata el texto cifrado a su caso y su campo: copiado a otra fila no descifra. */
export function disciplinaryContext(tenantId: string, caseId: string, field: string): string {
  return `hr_disciplinary_cases:${tenantId}:${caseId}:${field}`;
}

function dateOrNull(value: Date | null): string | null {
  return value === null ? null : toCalendarDate(value);
}

function summaryOf(row: HrDisciplinaryCase, name: string): DisciplinarySummary {
  return disciplinarySummarySchema.parse({
    id: row.id,
    code: row.code,
    employee: { id: row.employeeId, name },
    status: row.status,
    opened_on: toCalendarDate(row.openedOn),
    hearing_on: dateOrNull(row.hearingOn),
    decided_on: dateOrNull(row.decidedOn),
    decision: row.decision,
    version: row.version,
  });
}

export async function disciplinarySummaries(
  tx: TenantTransaction,
  rows: readonly HrDisciplinaryCase[],
): Promise<DisciplinarySummary[]> {
  const names = await employeeRefsById(
    tx,
    rows.map(({ employeeId }) => employeeId),
  );
  return rows.map((row) => summaryOf(row, names.get(row.employeeId)?.name ?? 'Colaborador'));
}

/** Descifra un campo del caso. */
function reveal(
  cipher: FieldCipher,
  row: HrDisciplinaryCase,
  field: string,
  value: string | null,
): string | null {
  return value === null
    ? null
    : cipher.decrypt(value, disciplinaryContext(row.tenantId, row.id, field));
}

/** El caso completo, para Talento humano. */
export function fullCase(
  cipher: FieldCipher,
  row: HrDisciplinaryCase,
  name: string,
): DisciplinaryCase {
  return disciplinaryCaseSchema.parse({
    ...summaryOf(row, name),
    facts: reveal(cipher, row, 'facts', row.factsEncrypted),
    cited_on: dateOrNull(row.citedOn),
    citation_file_id: row.citationFileId,
    statement: reveal(cipher, row, 'statement', row.statementEncrypted),
    hearing_record_file_id: row.hearingRecordFileId,
    suspension_days: row.suspensionDays,
    reasoning: reveal(cipher, row, 'reasoning', row.reasoningEncrypted),
    decision_file_id: row.decisionFileId,
  });
}

/** Lo que ve el colaborador de su caso: citación, hechos y decisión; no las notas internas. */
export function ownCase(
  cipher: FieldCipher,
  row: HrDisciplinaryCase,
  name: string,
): OwnDisciplinaryCase {
  return ownDisciplinaryCaseSchema.parse({
    ...summaryOf(row, name),
    facts: reveal(cipher, row, 'facts', row.factsEncrypted),
    cited_on: dateOrNull(row.citedOn),
    suspension_days: row.suspensionDays,
    reasoning: reveal(cipher, row, 'reasoning', row.reasoningEncrypted),
  });
}

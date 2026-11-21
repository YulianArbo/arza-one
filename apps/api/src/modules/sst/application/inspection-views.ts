import {
  INSPECTION_CATALOGS,
  type ChecklistItem,
  type Inspection,
  type InspectionAnswer,
  type InspectionKind,
} from '@arza/contracts';
import { z } from 'zod';

import type { SstInspection } from '../../../generated/prisma/client.js';
import type { TenantTransaction } from '../../../platform/database/tenant-context.js';
import { activeCatalogOptions } from '../../core/index.js';
import { employeeNamesForSst } from '../../hr/index.js';
import { dateOf, refOf, sstInvalid, userRefs } from './sst-support.js';

// Listas de chequeo y respuestas de las inspecciones (B37, decisión 11). Las respuestas guardan la
// pregunta tal como estaba ese día: si el catálogo cambia después, la inspección no cambia.

const storedAnswerSchema = z.object({
  code: z.string(),
  label: z.string(),
  result: z.enum(['ok', 'fail', 'na']),
  note: z.string().nullable(),
});
type StoredAnswer = z.infer<typeof storedAnswerSchema>;

export async function checklistOf(
  tx: TenantTransaction,
  kind: InspectionKind,
): Promise<ChecklistItem[]> {
  return activeCatalogOptions(tx, INSPECTION_CATALOGS[kind]);
}

/** Cada pregunta activa se responde una vez; no hay respuestas de más. */
export async function checkedAnswers(
  tx: TenantTransaction,
  kind: InspectionKind,
  answers: readonly InspectionAnswer[],
): Promise<{ readonly answers: StoredAnswer[]; readonly failed: number }> {
  const checklist = await checklistOf(tx, kind);
  const byCode = new Map(answers.map((answer) => [answer.code, answer]));
  if (byCode.size !== answers.length || answers.length !== checklist.length) {
    throw sstInvalid('Responda cada punto de la lista de chequeo una sola vez.');
  }
  const stored = checklist.map((item) => {
    const answer = byCode.get(item.code);
    if (answer === undefined) throw sstInvalid(`Falta responder «${item.label}».`);
    return { code: item.code, label: item.label, result: answer.result, note: answer.note };
  });
  return { answers: stored, failed: stored.filter((answer) => answer.result === 'fail').length };
}

export async function inspectionViews(
  tx: TenantTransaction,
  rows: readonly SstInspection[],
): Promise<Inspection[]> {
  const users = await userRefs(
    tx,
    rows.map((row) => row.inspectorId),
  );
  const employees = await employeeNamesForSst(
    tx,
    rows.flatMap((row) => (row.employeeId === null ? [] : [row.employeeId])),
  );
  return rows.map((row) => ({
    id: row.id,
    kind: row.kind as Inspection['kind'],
    status: row.status as Inspection['status'],
    place: row.place,
    employee: row.employeeId === null ? null : refOf(employees, row.employeeId, 'Colaborador'),
    inspector: row.inspectorId === null ? null : refOf(users, row.inspectorId),
    due_on: dateOf(row.dueOn),
    inspected_on: dateOf(row.inspectedOn),
    answers: z.array(storedAnswerSchema).parse(row.answers),
    failed: row.failed,
    findings: row.findings,
    version: row.version,
  }));
}

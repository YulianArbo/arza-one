import {
  LEGAL_NORM_TYPES,
  LEGAL_RESULTS,
  legalPeriodLabel,
  legalPeriodStart,
  type LegalEvaluation,
  type LegalRequirement,
  type QmsRef,
} from '@arza/contracts';

import type { QmsLegalEvaluation, QmsLegalRequirement } from '../../../generated/prisma/client.js';
import type { TenantTransaction } from '../../../platform/database/tenant-context.js';
import type { CsvCell } from '../../../platform/export/csv.js';
import { toCalendarDate } from '../../core/index.js';
import { optionalRef, processRefs, refOf, userRefs } from './qms-support.js';

// El normograma tal como se muestra (B46, ficha 17.17): cada requisito con su última evaluación
// («cada requisito muestra su última evaluación») y si está pendiente en el semestre en curso.

type EvaluationRow = QmsLegalEvaluation & { action: { id: string; code: string } | null };

interface LegalRefs {
  readonly people: ReadonlyMap<string, QmsRef>;
  readonly processes: ReadonlyMap<string, QmsRef>;
}

export function evaluationView(
  row: EvaluationRow,
  people: ReadonlyMap<string, QmsRef>,
): LegalEvaluation {
  const periodStart = toCalendarDate(row.periodStart);
  return {
    id: row.id,
    period_start: periodStart,
    period: legalPeriodLabel(periodStart),
    evaluated_on: toCalendarDate(row.evaluatedOn),
    result: row.result as LegalEvaluation['result'],
    evidence_note: row.evidenceNote,
    evidence_file_id: row.evidenceFileId,
    action: row.action,
    evaluated_by: refOf(people, row.evaluatedBy),
  };
}

function requirementView(
  row: QmsLegalRequirement,
  last: EvaluationRow | undefined,
  refs: LegalRefs,
  currentPeriod: string,
): LegalRequirement {
  const lastView = last === undefined ? null : evaluationView(last, refs.people);
  return {
    id: row.id,
    code: row.code,
    norm_type: row.normType as LegalRequirement['norm_type'],
    norm: row.norm,
    issuer: row.issuer,
    article: row.article,
    requirement: row.requirement,
    compliance_means: row.complianceMeans,
    process: optionalRef(refs.processes, row.processId, 'Proceso'),
    responsible: optionalRef(refs.people, row.responsibleId, 'Persona'),
    applies: row.applies,
    last_evaluation: lastView,
    pending: row.applies && lastView?.period_start !== currentPeriod,
    version: row.version,
  };
}

/** La última evaluación de cada requisito (la más reciente por fecha y por registro). */
export async function lastEvaluations(
  tx: TenantTransaction,
  requirementIds: readonly string[],
): Promise<Map<string, EvaluationRow>> {
  const rows = await tx.qmsLegalEvaluation.findMany({
    where: { requirementId: { in: [...requirementIds] }, deletedAt: null },
    orderBy: [{ evaluatedOn: 'desc' }, { id: 'desc' }],
    include: { action: { select: { id: true, code: true } } },
  });
  const last = new Map<string, EvaluationRow>();
  for (const row of rows) if (!last.has(row.requirementId)) last.set(row.requirementId, row);
  return last;
}

/** El normograma completo, ordenado por norma y artículo. */
export async function loadRequirements(
  tx: TenantTransaction,
  today: string,
): Promise<LegalRequirement[]> {
  const rows = await tx.qmsLegalRequirement.findMany({
    where: { deletedAt: null },
    orderBy: [{ norm: 'asc' }, { article: 'asc' }, { code: 'asc' }],
  });
  const last = await lastEvaluations(
    tx,
    rows.map((row) => row.id),
  );
  const evaluators = [...last.values()].map((row) => row.evaluatedBy);
  const [people, processes] = await Promise.all([
    userRefs(tx, [...rows.map((row) => row.responsibleId), ...evaluators]),
    processRefs(
      tx,
      rows.map((row) => row.processId),
    ),
  ]);
  const currentPeriod = legalPeriodStart(today);
  return rows.map((row) =>
    requirementView(row, last.get(row.id), { people, processes }, currentPeriod),
  );
}

function shownDate(date: string): string {
  const [year, month, day] = date.split('-');
  return `${day ?? ''}/${month ?? ''}/${year ?? ''}`;
}

/** Una fila del archivo del normograma (columnas LEGAL_FILE_COLUMNS, por validar). */
export function legalFileRow(requirement: LegalRequirement): CsvCell[] {
  const last = requirement.last_evaluation;
  return [
    requirement.code,
    LEGAL_NORM_TYPES[requirement.norm_type],
    requirement.norm,
    requirement.issuer,
    requirement.article,
    requirement.requirement,
    requirement.compliance_means,
    requirement.process?.name ?? null,
    requirement.responsible?.name ?? null,
    requirement.applies ? 'Sí' : 'No',
    last === null ? null : shownDate(last.evaluated_on),
    last === null ? null : LEGAL_RESULTS[last.result],
    last?.action?.code ?? null,
  ];
}

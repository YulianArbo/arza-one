import {
  ACTION_ORIGINS,
  ACTION_STATUSES,
  ACTION_TYPES,
  type QmsAction,
  type QmsRef,
} from '@arza/contracts';

import type { QmsAction as QmsActionRow } from '../../../generated/prisma/client.js';
import type { TenantTransaction } from '../../../platform/database/tenant-context.js';
import type { CsvCell } from '../../../platform/export/csv.js';
import { bogotaToday, toCalendarDate } from '../../core/index.js';
import { dateOf, optionalRef, processRefs, refOf, userRefs } from './qms-support.js';

// La fila de la bitácora de acciones (RE-SGC-002, decisión 10): cada acción con su origen, el
// hallazgo y la causa raíz de la no conformidad (o la descripción del riesgo), y su verificación.

interface OriginFacts {
  readonly code: string;
  readonly finding: string;
  readonly rootCause: string | null;
  readonly processId: string | null;
}

interface ViewRefs {
  readonly origins: ReadonlyMap<string, OriginFacts>;
  readonly people: ReadonlyMap<string, QmsRef>;
  readonly processes: ReadonlyMap<string, QmsRef>;
  readonly today: string;
}

function originKey(row: QmsActionRow): string | null {
  return row.nonconformityId ?? row.riskId;
}

async function originFacts(
  tx: TenantTransaction,
  rows: readonly QmsActionRow[],
): Promise<Map<string, OriginFacts>> {
  const ncIds = rows.flatMap((row) => (row.nonconformityId === null ? [] : [row.nonconformityId]));
  const riskIds = rows.flatMap((row) => (row.riskId === null ? [] : [row.riskId]));
  const [ncs, risks] = await Promise.all([
    tx.qmsNonconformity.findMany({ where: { id: { in: [...new Set(ncIds)] } } }),
    tx.qmsRisk.findMany({ where: { id: { in: [...new Set(riskIds)] } } }),
  ]);
  return new Map<string, OriginFacts>([
    ...ncs.map((nc): [string, OriginFacts] => [
      nc.id,
      { code: nc.code, finding: nc.description, rootCause: nc.rootCause, processId: nc.processId },
    ]),
    ...risks.map((risk): [string, OriginFacts] => [
      risk.id,
      { code: risk.code, finding: risk.description, rootCause: null, processId: risk.processId },
    ]),
  ]);
}

function actionView(row: QmsActionRow, refs: ViewRefs): QmsAction {
  const key = originKey(row);
  const origin = key === null ? undefined : refs.origins.get(key);
  const processId = row.processId ?? origin?.processId ?? null;
  const dueOn = toCalendarDate(row.dueOn);
  return {
    id: row.id,
    code: row.code,
    opened_on: bogotaToday(row.createdAt),
    origin_type: row.originType as QmsAction['origin_type'],
    origin: key === null || origin === undefined ? null : { id: key, code: origin.code },
    process: optionalRef(refs.processes, processId, 'Proceso'),
    finding: origin?.finding ?? null,
    root_cause: origin?.rootCause ?? null,
    action_type: row.actionType as QmsAction['action_type'],
    description: row.description,
    responsible: refOf(refs.people, row.responsibleId),
    due_on: dueOn,
    executed_on: dateOf(row.executedOn),
    evidence_note: row.evidenceNote,
    evidence_file_id: row.evidenceFileId,
    status: row.status as QmsAction['status'],
    overdue: row.status === 'open' && dueOn < refs.today,
    verified_on: dateOf(row.verifiedOn),
    verified_by: optionalRef(refs.people, row.verifiedBy, 'Persona'),
    verification_note: row.verificationNote,
    notes: row.notes,
    version: row.version,
  };
}

/** Las filas de la bitácora con sus orígenes, personas y procesos. */
export async function actionViews(
  tx: TenantTransaction,
  rows: readonly QmsActionRow[],
  today: string,
): Promise<QmsAction[]> {
  const origins = await originFacts(tx, rows);
  const people = await userRefs(
    tx,
    rows.flatMap((row) => [row.responsibleId, row.verifiedBy]),
  );
  const processes = await processRefs(tx, [
    ...rows.map((row) => row.processId),
    ...[...origins.values()].map((origin) => origin.processId),
  ]);
  const refs = { origins, people, processes, today };
  return rows.map((row) => actionView(row, refs));
}

function shownDate(date: string | null): string | null {
  if (date === null) return null;
  const [year, month, day] = date.split('-');
  return `${day ?? ''}/${month ?? ''}/${year ?? ''}`;
}

function verificationResult(action: QmsAction): string | null {
  if (action.status === 'effective') return 'Eficaz';
  if (action.status === 'ineffective') return 'No eficaz';
  return null;
}

/** Una fila del archivo, en el orden de ACTION_LOG_COLUMNS. */
export function actionLogRow(action: QmsAction): CsvCell[] {
  return [
    action.code,
    shownDate(action.opened_on),
    ACTION_ORIGINS[action.origin_type],
    action.origin?.code ?? null,
    action.process?.name ?? null,
    action.finding,
    action.root_cause,
    action.description,
    ACTION_TYPES[action.action_type],
    action.responsible.name,
    shownDate(action.due_on),
    shownDate(action.executed_on),
    ACTION_STATUSES[action.status],
    action.verified_by?.name ?? null,
    shownDate(action.verified_on),
    verificationResult(action),
    action.notes,
  ];
}

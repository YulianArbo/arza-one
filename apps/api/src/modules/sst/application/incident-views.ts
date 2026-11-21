import type {
  InvestigationAction,
  SstIncidentDetail,
  SstIncidentSummary,
  SstRef,
} from '@arza/contracts';

import type {
  SstIncident,
  SstInvestigation,
  SstInvestigationAction,
} from '../../../generated/prisma/client.js';
import type { TenantTransaction } from '../../../platform/database/tenant-context.js';
import { bogotaToday, toCalendarDate } from '../../core/index.js';
import { employeeNamesForSst } from '../../hr/index.js';
import { dateOf, refOf, userRefs } from './sst-support.js';

// Cómo se muestran los incidentes, su investigación y sus acciones (B37).

type InvestigationWithActions = SstInvestigation & { readonly actions: SstInvestigationAction[] };
export type IncidentRow = SstIncident & { readonly investigation: InvestigationWithActions | null };

interface Names {
  readonly users: ReadonlyMap<string, SstRef>;
  readonly employees: ReadonlyMap<string, SstRef>;
}

/** Los nombres de quienes aparecen en los incidentes: quien reporta, el lesionado y responsables. */
export async function incidentNames(
  tx: TenantTransaction,
  rows: readonly IncidentRow[],
): Promise<Names> {
  const actions = rows.flatMap((row) => row.investigation?.actions ?? []);
  const users = await userRefs(tx, [
    ...rows.map((row) => row.reportedBy),
    ...actions.map((action) => action.responsibleId),
  ]);
  const employees = await employeeNamesForSst(
    tx,
    rows.flatMap((row) => (row.affectedEmployeeId === null ? [] : [row.affectedEmployeeId])),
  );
  return { users, employees };
}

export function incidentSummary(row: SstIncident, names: Names, now: Date): SstIncidentSummary {
  const due = dateOf(row.arlDueOn);
  return {
    id: row.id,
    code: row.code,
    kind: row.kind as SstIncidentSummary['kind'],
    status: row.status as SstIncidentSummary['status'],
    occurred_at: row.occurredAt.toISOString(),
    location: row.location,
    affected: row.affected as SstIncidentSummary['affected'],
    affected_employee:
      row.affectedEmployeeId === null
        ? null
        : refOf(names.employees, row.affectedEmployeeId, 'Colaborador'),
    reported_by: refOf(names.users, row.reportedBy),
    arl_due_on: due,
    arl_reported_on: dateOf(row.arlReportedOn),
    arl_overdue: due !== null && row.arlReportedOn === null && due < bogotaToday(now),
    version: row.version,
  };
}

export function actionView(action: SstInvestigationAction, names: Names): InvestigationAction {
  return {
    id: action.id,
    description: action.description,
    responsible: refOf(names.users, action.responsibleId),
    due_on: toCalendarDate(action.dueOn),
    done_on: dateOf(action.doneOn),
    note: action.note,
    version: action.version,
  };
}

export function incidentDetail(row: IncidentRow, names: Names, now: Date): SstIncidentDetail {
  const investigation = row.investigation;
  return {
    ...incidentSummary(row, names, now),
    description: row.description,
    photo_file_id: row.photoFileId,
    arl_filing_number: row.arlFilingNumber,
    team: investigation?.team ?? null,
    immediate_causes: investigation?.immediateCauses ?? null,
    root_causes: investigation?.rootCauses ?? null,
    conclusion: investigation?.conclusion ?? null,
    actions: (investigation?.actions ?? [])
      .filter((action) => action.deletedAt === null)
      .sort((a, b) => a.dueOn.getTime() - b.dueOn.getTime())
      .map((action) => actionView(action, names)),
  };
}

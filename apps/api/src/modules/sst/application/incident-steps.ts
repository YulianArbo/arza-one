import type {
  CloseIncident,
  InvestigationPlan,
  ReportToArl,
  StartInvestigation,
} from '@arza/contracts';

import type { Prisma } from '../../../generated/prisma/client.js';
import type { Principal } from '../../../platform/access/principal.js';
import type { TenantTransaction } from '../../../platform/database/tenant-context.js';
import { versionConflict } from '../../../platform/http/if-match.js';
import { bogotaToday, fromCalendarDate, toCalendarDate } from '../../core/index.js';
import { activeEmployeeForSst } from '../../hr/index.js';
import { activeCollaborators } from '../../iam/index.js';
import type { IncidentRow } from './incident-views.js';
import { auditSst, emitSst, sstConflict, sstInvalid, type SstActor } from './sst-support.js';

// Pasos del incidente (B37, ficha 17.14): reportado → en investigación → con plan de acción →
// cerrado. El reporte a la ARL aplica solo a los accidentes y se registra con su radicado. El
// incidente se cierra cuando todas las acciones están hechas y, si es accidente, ya se reportó.

export interface IncidentContext {
  readonly tx: TenantTransaction;
  readonly principal: Principal;
  readonly actor: SstActor;
  readonly row: IncidentRow;
  readonly version: number;
}

async function store(
  ctx: IncidentContext,
  data: Prisma.SstIncidentUpdateManyMutationInput,
  audit: { readonly action: string; readonly changes: Prisma.InputJsonObject },
): Promise<void> {
  const updated = await ctx.tx.sstIncident.updateMany({
    where: { id: ctx.row.id, version: ctx.version },
    data,
  });
  if (updated.count !== 1) throw versionConflict();
  await auditSst(ctx.tx, ctx.actor, {
    action: audit.action,
    entityType: 'sst_incident',
    entityId: ctx.row.id,
    changes: audit.changes,
  });
}

/** Registra la fecha y el radicado del reporte a la ARL (FURAT). */
export async function reportToArl(ctx: IncidentContext, input: ReportToArl): Promise<void> {
  if (ctx.row.kind !== 'accident') throw sstConflict('Solo los accidentes se reportan a la ARL.');
  if (ctx.row.arlReportedOn !== null) throw sstConflict('El accidente ya se reportó a la ARL.');
  const today = bogotaToday(ctx.actor.at);
  const occurred = bogotaToday(ctx.row.occurredAt);
  if (input.reported_on > today || input.reported_on < occurred) {
    throw sstInvalid('La fecha del reporte va entre el día del accidente y hoy.');
  }
  const due = ctx.row.arlDueOn === null ? null : toCalendarDate(ctx.row.arlDueOn);
  await store(
    ctx,
    {
      arlReportedOn: fromCalendarDate(input.reported_on),
      arlFilingNumber: input.filing_number,
      arlReportedBy: ctx.actor.userId,
    },
    {
      action: 'sst.incident.report_arl',
      changes: {
        reported_on: input.reported_on,
        on_time: due === null || input.reported_on <= due,
      },
    },
  );
}

/** Abre la investigación con el equipo que investiga. */
export async function startInvestigation(
  ctx: IncidentContext,
  input: StartInvestigation,
): Promise<void> {
  if (ctx.row.status !== 'reported') throw sstConflict('El incidente ya está en investigación.');
  if (
    input.affected_employee_id !== null &&
    (await activeEmployeeForSst(ctx.tx, input.affected_employee_id)) === null
  ) {
    throw sstInvalid('El colaborador afectado no existe o no está activo.');
  }
  const startedOn = bogotaToday(ctx.actor.at);
  await ctx.tx.sstInvestigation.create({
    data: {
      tenantId: ctx.actor.tenantId,
      incidentId: ctx.row.id,
      team: input.team,
      startedOn: fromCalendarDate(startedOn),
    },
  });
  await store(
    ctx,
    {
      status: 'investigating',
      ...(input.affected_employee_id === null
        ? {}
        : { affectedEmployeeId: input.affected_employee_id }),
    },
    {
      action: 'sst.incident.investigate',
      changes: { status: { from: 'reported', to: 'investigating' }, started_on: startedOn },
    },
  );
}

async function assertResponsibles(ctx: IncidentContext, plan: InvestigationPlan): Promise<void> {
  const ids = [...new Set(plan.actions.map((action) => action.responsible_id))];
  const found = await activeCollaborators(ctx.tx, ids);
  if (found.length !== ids.length) {
    throw sstInvalid('Cada responsable debe ser un colaborador activo.');
  }
  const today = bogotaToday(ctx.actor.at);
  if (plan.actions.some((action) => action.due_on < today)) {
    throw sstInvalid('Las fechas de las acciones no pueden estar en el pasado.');
  }
}

function actionData(
  ctx: IncidentContext,
  investigationId: string,
  action: InvestigationPlan['actions'][number],
) {
  return {
    tenantId: ctx.actor.tenantId,
    investigationId,
    description: action.description,
    responsibleId: action.responsible_id,
    dueOn: fromCalendarDate(action.due_on),
  };
}

/** Registra las causas y las acciones; cada responsable recibe su aviso (decisión 6). */
export async function planInvestigation(
  ctx: IncidentContext,
  input: InvestigationPlan,
): Promise<void> {
  const investigation = ctx.row.investigation;
  if (ctx.row.status !== 'investigating' || investigation === null) {
    throw sstConflict('El plan se registra con la investigación abierta y sin plan previo.');
  }
  await assertResponsibles(ctx, input);
  const plannedOn = bogotaToday(ctx.actor.at);
  await ctx.tx.sstInvestigation.update({
    where: { id: investigation.id },
    data: {
      immediateCauses: input.immediate_causes,
      rootCauses: input.root_causes,
      plannedOn: fromCalendarDate(plannedOn),
    },
  });
  await ctx.tx.sstInvestigationAction.createMany({
    data: input.actions.map((action) => actionData(ctx, investigation.id, action)),
  });
  await store(
    ctx,
    { status: 'action_plan' },
    {
      action: 'sst.incident.plan',
      changes: {
        status: { from: 'investigating', to: 'action_plan' },
        actions: input.actions.length,
      },
    },
  );
  await announceActions(ctx, input);
}

/** Cada responsable recibe el aviso de su acción. */
async function announceActions(ctx: IncidentContext, input: InvestigationPlan): Promise<void> {
  for (const action of input.actions) {
    await emitSst(ctx.tx, ctx.actor, 'sst.task.assigned', {
      incident_id: ctx.row.id,
      task: `Acción del ${ctx.row.code}: ${action.description}`,
      due_on: action.due_on,
      recipients: [action.responsible_id],
    });
  }
}

/** Cierra el incidente: acciones hechas y, si es accidente, reportado a la ARL. */
export async function closeIncident(ctx: IncidentContext, input: CloseIncident): Promise<void> {
  const investigation = ctx.row.investigation;
  if (ctx.row.status !== 'action_plan' || investigation === null) {
    throw sstConflict('Solo se cierra un incidente con su plan de acción.');
  }
  if (investigation.actions.some((action) => action.doneOn === null && action.deletedAt === null)) {
    throw sstConflict('Aún hay acciones del plan por terminar.');
  }
  if (ctx.row.kind === 'accident' && ctx.row.arlReportedOn === null) {
    throw sstConflict('Registre primero el reporte del accidente a la ARL.');
  }
  const closedOn = bogotaToday(ctx.actor.at);
  await ctx.tx.sstInvestigation.update({
    where: { id: investigation.id },
    data: { conclusion: input.conclusion, closedOn: fromCalendarDate(closedOn) },
  });
  await store(
    ctx,
    { status: 'closed', closedAt: ctx.actor.at, closedBy: ctx.actor.userId },
    { action: 'sst.incident.close', changes: { status: { from: 'action_plan', to: 'closed' } } },
  );
}

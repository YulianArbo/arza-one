import type { Clock } from '../../../platform/clock/clock.js';
import type { DatabaseService } from '../../../platform/database/database.service.js';
import type { TenantTransaction } from '../../../platform/database/tenant-context.js';
import {
  onWorkflowTransition,
  seedPublishedFlow,
  type TransitionNotice,
  type WfContext,
} from '../../wf/index.js';
import { LEAD_FLOW, LEAD_FLOW_DATA, LEAD_FLOW_STATES } from '../domain/crm-flows.js';
import { recordCrmChange } from './crm-support.js';
import { crmNotFound } from './crm-messages.js';

// El flujo del prospecto en el motor (B22): la semilla lo publica en cada empresa la primera vez y,
// al arrancar el módulo, el CRM se inscribe para seguir sus pasos en la misma transacción
// (ADR-023). Si la tarea se atiende desde Mis tareas, el prospecto cambia con ella.

/** Motivo con el que queda un prospecto descartado desde Mis tareas: el comentario lo explica. */
const TASK_DISCARD_REASON = 'OTHER';

export async function seedCrmWorkflows(
  database: Pick<DatabaseService, 'withTenant'>,
  tenantIds: readonly string[],
  clock: Clock,
): Promise<void> {
  for (const tenantId of tenantIds) {
    const context = { tenantId, userId: null, meta: null, at: clock.now() };
    await database.withTenant({ tenantId, userId: null }, (tx) =>
      seedPublishedFlow(tx, context, LEAD_FLOW_DATA),
    );
  }
}

/** Nota del descarte: el comentario de la tarea, si alcanza el largo mínimo. */
function noteOf(comment: string | null): string | null {
  const text = comment?.trim() ?? '';
  return text.length >= 3 ? text.slice(0, 2000) : null;
}

async function followLeadFlow(
  tx: TenantTransaction,
  context: WfContext,
  notice: TransitionNotice,
): Promise<void> {
  const lead = await tx.crmLead.findFirst({ where: { id: notice.entityId, deletedAt: null } });
  if (lead === null) throw crmNotFound('El prospecto');
  // Desde el CRM el prospecto ya cambió antes de cerrar la tarea: no hay nada más que hacer.
  if (lead.status !== 'new') return;
  if (notice.toState === LEAD_FLOW_STATES.qualified) {
    await tx.crmLead.update({
      where: { id: lead.id },
      data: { status: 'qualified', qualifiedAt: context.at },
    });
    await recordCrmChange(tx, context, {
      action: 'crm.lead.qualify',
      event: 'crm.lead.qualified',
      entityType: 'crm_lead',
      entityId: lead.id,
      changes: { code: lead.code, status: ['new', 'qualified'], from_task: true },
    });
    return;
  }
  if (notice.toState !== LEAD_FLOW_STATES.discarded) return;
  await tx.crmLead.update({
    where: { id: lead.id },
    data: {
      status: 'discarded',
      discardReason: TASK_DISCARD_REASON,
      discardNote: noteOf(notice.comment),
      closedAt: context.at,
    },
  });
  await recordCrmChange(tx, context, {
    action: 'crm.lead.discard',
    event: 'crm.lead.discarded',
    entityType: 'crm_lead',
    entityId: lead.id,
    changes: { code: lead.code, status: ['new', 'discarded'], reason: TASK_DISCARD_REASON },
  });
}

export function followCrmWorkflows(): void {
  onWorkflowTransition(LEAD_FLOW, followLeadFlow);
}

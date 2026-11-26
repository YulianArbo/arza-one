import { actionTypeOf, type ActionOrigin } from '@arza/contracts';

import type { TenantTransaction } from '../../../platform/database/tenant-context.js';
import { bogotaToday, fromCalendarDate, nextBusinessCode } from '../../core/index.js';
import { assertPerson, auditQms, emitQms, qmsInvalid, type QmsActor } from './qms-support.js';

// Registrar una acción correctiva o de mejora dentro de la transacción de quien la origina: el
// formulario de la bitácora (B38), un hallazgo de auditoría o una decisión de la revisión por la
// dirección (B39) o una evaluación legal parcial o negativa (B46). Su responsable recibe el aviso.

const ACTIONS = { name: 'Acciones correctivas y de mejora', prefix: 'AC', padding: 4 };

export interface ActionLink {
  readonly nonconformityId: string | null;
  readonly riskId: string | null;
  readonly findingId: string | null;
  readonly reviewId: string | null;
  readonly legalRequirementId: string | null;
  readonly processId: string | null;
}

export const NO_LINK: ActionLink = {
  nonconformityId: null,
  riskId: null,
  findingId: null,
  reviewId: null,
  legalRequirementId: null,
  processId: null,
};

export interface NewAction {
  readonly originType: ActionOrigin;
  readonly link: ActionLink;
  readonly description: string;
  readonly responsibleId: string;
  readonly dueOn: string;
  readonly notes: string | null;
}

/** El responsable existe y la fecha compromiso no está en el pasado. */
export async function assertPlan(
  tx: TenantTransaction,
  actor: QmsActor,
  input: { readonly responsible_id: string; readonly due_on: string },
): Promise<void> {
  await assertPerson(tx, input.responsible_id);
  if (input.due_on < bogotaToday(actor.at)) {
    throw qmsInvalid('La fecha compromiso no puede estar en el pasado.');
  }
}

export async function notifyAssigned(
  tx: TenantTransaction,
  actor: QmsActor,
  action: { id: string; code: string; responsibleId: string; dueOn: string },
): Promise<void> {
  await emitQms(tx, actor, 'qms.action.assigned', {
    action_id: action.id,
    code: action.code,
    due_on: action.dueOn,
    recipients: [action.responsibleId],
  });
}

/** Crea la acción, deja su auditoría y avisa a su responsable. */
export async function insertAction(
  tx: TenantTransaction,
  actor: QmsActor,
  input: NewAction,
): Promise<{ readonly id: string; readonly code: string }> {
  const code = await nextBusinessCode(tx, 'qms.action', actor.at, ACTIONS);
  const row = await tx.qmsAction.create({
    data: {
      tenantId: actor.tenantId,
      code,
      originType: input.originType,
      ...input.link,
      actionType: actionTypeOf(input.originType),
      description: input.description,
      responsibleId: input.responsibleId,
      dueOn: fromCalendarDate(input.dueOn),
      notes: input.notes,
    },
  });
  await auditQms(tx, actor, {
    action: 'qms.action.create',
    entityType: 'qms_action',
    entityId: row.id,
    changes: { code, origin_type: input.originType, due_on: input.dueOn },
  });
  await notifyAssigned(tx, actor, { ...row, dueOn: input.dueOn });
  return { id: row.id, code };
}

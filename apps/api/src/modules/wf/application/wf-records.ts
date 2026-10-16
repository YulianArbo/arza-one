import type { AppAbility } from '../../../platform/access/ability.js';
import type { Principal } from '../../../platform/access/principal.js';
import type { TenantTransaction } from '../../../platform/database/tenant-context.js';
import { instanceAccess } from './wf-access.js';
import { taskActorOf } from './wf-context.js';

// Lo que otros módulos necesitan saber de los trámites y las tareas (B16): los avisos nombran la
// tarea, y los comentarios y adjuntos de un trámite exigen que la persona pueda verlo.

/** Título y vencimiento de la tarea, para el texto del aviso; null si no existe. */
export async function taskNoticeFacts(
  tx: TenantTransaction,
  taskId: string,
): Promise<{ readonly title: string; readonly dueAt: Date | null } | null> {
  return tx.workflowTask.findFirst({
    where: { id: taskId, deletedAt: null },
    select: { title: true, dueAt: true },
  });
}

/** Título del trámite si la persona puede verlo; si no, null (para ella «no existe»). */
export async function visibleInstanceTitle(
  tx: TenantTransaction,
  principal: Principal,
  ability: AppAbility,
  instanceId: string,
  now: Date,
): Promise<string | null> {
  const instance = await tx.workflowInstance.findFirst({
    where: { id: instanceId, deletedAt: null },
  });
  if (instance === null) return null;
  const actor = await taskActorOf(tx, principal, ability, now);
  const access = await instanceAccess(tx, instance, actor, ability);
  return access.visible ? instance.title : null;
}

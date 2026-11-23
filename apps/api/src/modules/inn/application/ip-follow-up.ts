import type { TenantTransaction } from '../../../platform/database/tenant-context.js';
import { hasActiveWorkflow, seedPublishedFlow, startWorkflow } from '../../wf/index.js';
import { IP_FOLLOW_UP_FLOW, IP_FOLLOW_UP_FLOW_DATA } from '../domain/inn-flows.js';
import type { InnActor } from './inn-support.js';

// Tarea de seguimiento de un activo (decisiones 6 y 7): la recibe su responsable en Mis tareas. Si
// la empresa aún no tiene el flujo, se publica la primera vez; si ya hay una tarea abierta del
// mismo activo, no se duplica.

export interface FollowUp {
  readonly assetId: string;
  readonly responsibleId: string;
  readonly title: string;
  readonly reason: 'renewal' | 'registration';
}

/** Abre la tarea; dice si la abrió. */
export async function openFollowUp(
  tx: TenantTransaction,
  actor: InnActor,
  followUp: FollowUp,
): Promise<boolean> {
  await seedPublishedFlow(tx, actor, IP_FOLLOW_UP_FLOW_DATA);
  if (await hasActiveWorkflow(tx, IP_FOLLOW_UP_FLOW, followUp.assetId)) return false;
  await startWorkflow(tx, actor, {
    key: IP_FOLLOW_UP_FLOW,
    entityType: IP_FOLLOW_UP_FLOW,
    entityId: followUp.assetId,
    title: followUp.title,
    facts: { reason: followUp.reason },
    initiator: followUp.responsibleId,
  });
  return true;
}

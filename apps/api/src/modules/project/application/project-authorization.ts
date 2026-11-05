import type { PrjProject } from '../../../generated/prisma/client.js';
import type { TenantTransaction } from '../../../platform/database/tenant-context.js';
import { startWorkflow, type TransitionNotice, type WfContext } from '../../wf/index.js';
import { START_FLOW, START_STATES } from '../domain/project-flows.js';
import { findProject, projectAudit, projectPayload } from './project-records.js';
import { recordProjectChange, type ProjectActor } from './project-support.js';

// La autorización de la Dirección para iniciar un proyecto sin contrato vigente (B26, ficha 17.8).
// El Líder técnico la pide con su motivo; la Dirección decide desde Mis tareas y el proyecto cambia
// en la misma transacción que el trámite (ADR-023).

/** La Dirección recibe en Mis tareas «Autorizar el inicio del proyecto …». */
export async function startAuthorization(
  tx: TenantTransaction,
  actor: ProjectActor,
  project: Pick<PrjProject, 'id' | 'code' | 'name'>,
): Promise<string> {
  const instance = await startWorkflow(tx, actor, {
    key: START_FLOW,
    entityType: START_FLOW,
    entityId: project.id,
    title: `Autorizar el inicio del proyecto ${project.code}: ${project.name}`,
    facts: {},
  });
  return instance.id;
}

/** Autorizado: el proyecto pasa a ejecución. No autorizado: sigue en planeación. */
async function decide(
  tx: TenantTransaction,
  context: WfContext,
  project: PrjProject,
  notice: TransitionNotice,
): Promise<void> {
  const granted = notice.toState === START_STATES.authorized;
  const { count } = await tx.prjProject.updateMany({
    where: { id: project.id, authorizationStatus: 'requested', deletedAt: null },
    data: {
      authorizationStatus: granted ? 'granted' : 'denied',
      authorizationNote: notice.comment,
      authorizationDecidedBy: context.userId,
      authorizationDecidedAt: context.at,
      ...(granted && project.status === 'planning'
        ? { status: 'in_progress', startedAt: context.at }
        : {}),
    },
  });
  if (count === 0) return;
  await recordProjectChange(tx, context, {
    action: granted ? 'project.authorization.grant' : 'project.authorization.deny',
    event: granted ? 'project.authorization.granted' : 'project.authorization.denied',
    entityType: 'prj_project',
    entityId: project.id,
    changes: {
      ...projectAudit(project),
      authorization_status: ['requested', granted ? 'granted' : 'denied'],
      ...(granted ? { status: [project.status, 'in_progress'] } : {}),
      comment: notice.comment,
    },
    payload: projectPayload(project),
  });
}

/** Oyente del trámite: la decisión de la Dirección desde Mis tareas. */
export async function followStartFlow(
  tx: TenantTransaction,
  context: WfContext,
  notice: TransitionNotice,
): Promise<void> {
  if (notice.toState !== START_STATES.authorized && notice.toState !== START_STATES.denied) return;
  const project = await findProject(tx, notice.entityId);
  await decide(tx, context, project, notice);
}

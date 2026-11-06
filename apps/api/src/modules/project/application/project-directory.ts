import type { TenantTransaction } from '../../../platform/database/tenant-context.js';
import type { ProjectActor } from './project-support.js';

// Lo que Proyectos ofrece a otros módulos (B28): el código, el nombre y el cliente de sus proyectos y
// entregables, y el aviso, en la misma transacción, de que el cliente aceptó un entregable (inicia
// su garantía en la mesa de ayuda, numeral 13.3). Nadie más lee las tablas prj_.

export interface ProjectRef {
  readonly id: string;
  readonly code: string;
  readonly name: string;
  readonly partyId: string;
}

export interface DeliverableRef {
  readonly id: string;
  readonly projectId: string;
  readonly name: string;
  readonly acceptedAt: Date | null;
}

/** Proyectos que existen, por identificador. */
export async function projectRefs(
  tx: TenantTransaction,
  ids: readonly string[],
): Promise<Map<string, ProjectRef>> {
  if (ids.length === 0) return new Map();
  const projects = await tx.prjProject.findMany({
    where: { id: { in: [...new Set(ids)] }, deletedAt: null },
    select: { id: true, code: true, name: true, partyId: true },
  });
  return new Map(projects.map((project) => [project.id, project]));
}

/** Entregables que existen, por identificador. */
export async function deliverableRefs(
  tx: TenantTransaction,
  ids: readonly string[],
): Promise<Map<string, DeliverableRef>> {
  if (ids.length === 0) return new Map();
  const deliverables = await tx.prjDeliverable.findMany({
    where: { id: { in: [...new Set(ids)] }, deletedAt: null },
    select: { id: true, projectId: true, name: true, acceptedAt: true },
  });
  return new Map(deliverables.map((deliverable) => [deliverable.id, deliverable]));
}

/** El cliente aceptó un entregable (con firma o tácitamente). */
export interface DeliverableAccepted {
  readonly project: ProjectRef;
  readonly deliverable: DeliverableRef;
}

export type DeliverableAcceptedListener = (
  tx: TenantTransaction,
  actor: ProjectActor,
  accepted: DeliverableAccepted,
) => Promise<void>;

const listeners: DeliverableAcceptedListener[] = [];

/** Un módulo se inscribe una vez, al arrancar (como los trámites, ADR-023). */
export function onDeliverableAccepted(listener: DeliverableAcceptedListener): void {
  if (!listeners.includes(listener)) listeners.push(listener);
}

export async function notifyDeliverableAccepted(
  tx: TenantTransaction,
  actor: ProjectActor,
  accepted: DeliverableAccepted,
): Promise<void> {
  for (const listener of listeners) await listener(tx, actor, accepted);
}

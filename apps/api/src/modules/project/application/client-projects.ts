import {
  acceptanceStatusSchema,
  deliverableStatusSchema,
  milestoneStatusSchema,
  type PortalDeliverable,
  type PortalMilestone,
  type PortalProjectDetail,
  type PortalProjectSummary,
} from '@arza/contracts';

import type {
  PrjAcceptance,
  PrjDeliverable,
  PrjMilestone,
  PrjProject,
  Prisma,
} from '../../../generated/prisma/client.js';
import type { TenantTransaction } from '../../../platform/database/tenant-context.js';
import { toCalendarDate } from '../../core/index.js';
import { projectNotFound } from './project-messages.js';
import { progressByProject } from './project-queries.js';
import { statusOf } from './project-records.js';

// Lo que el portal del cliente ve de Proyectos (B30, decisiones 2 y 3). Solo los proyectos de su
// empresa que ya iniciaron y que el líder dejó visibles; el usuario del cliente, además, solo los
// que su administrador le asignó. Nunca horas, dinero, riesgos, ítems ni notas del equipo. Lo que
// no se puede ver «no existe».

/** A quién se le muestra: la empresa cliente, la persona y si ve todos los de su empresa. */
export interface ClientProjectScope {
  readonly partyId: string;
  readonly userId: string;
  /** Administrador del cliente: todos los proyectos visibles de su empresa. */
  readonly allProjects: boolean;
}

/** Los proyectos visibles de la empresa: ya iniciaron y el líder no los ocultó. */
function companyWhere(partyId: string): Prisma.PrjProjectWhereInput {
  return { partyId, portalVisible: true, status: { not: 'planning' }, deletedAt: null };
}

function clientWhere(scope: ClientProjectScope): Prisma.PrjProjectWhereInput {
  const where = companyWhere(scope.partyId);
  if (scope.allProjects) return where;
  return { ...where, clientAccess: { some: { userId: scope.userId, deletedAt: null } } };
}

/** Identificadores de los proyectos que la persona ve. */
export async function clientProjectIds(
  tx: TenantTransaction,
  scope: ClientProjectScope,
): Promise<string[]> {
  const rows = await tx.prjProject.findMany({ where: clientWhere(scope), select: { id: true } });
  return rows.map((row) => row.id);
}

function milestoneView(milestone: PrjMilestone): PortalMilestone {
  return {
    id: milestone.id,
    name: milestone.name,
    due_on: toCalendarDate(milestone.dueOn),
    status: milestoneStatusSchema.parse(milestone.status),
  };
}

async function milestonesOf(tx: TenantTransaction, projectIds: readonly string[]) {
  return tx.prjMilestone.findMany({
    where: { projectId: { in: [...projectIds] }, deletedAt: null },
    orderBy: [{ dueOn: 'asc' }, { id: 'asc' }],
  });
}

async function awaitingByProject(tx: TenantTransaction, projectIds: readonly string[]) {
  const rows = await tx.prjAcceptance.groupBy({
    by: ['projectId'],
    where: { projectId: { in: [...projectIds] }, status: 'in_signature', deletedAt: null },
    _count: { _all: true },
  });
  return new Map(rows.map((row) => [row.projectId, row._count._all]));
}

async function summariesOf(
  tx: TenantTransaction,
  projects: readonly PrjProject[],
): Promise<PortalProjectSummary[]> {
  const ids = projects.map((project) => project.id);
  const [progress, milestones, awaiting] = await Promise.all([
    progressByProject(tx, ids),
    milestonesOf(tx, ids),
    awaitingByProject(tx, ids),
  ]);
  return projects.map((project) => {
    const next = milestones.find((row) => row.projectId === project.id && row.status === 'pending');
    return {
      id: project.id,
      code: project.code,
      name: project.name,
      status: statusOf(project),
      starts_on: toCalendarDate(project.startsOn),
      ends_on: toCalendarDate(project.endsOn),
      progress_pct: progress.get(project.id)?.percent ?? 0,
      next_milestone: next === undefined ? null : milestoneView(next),
      awaiting_client: awaiting.get(project.id) ?? 0,
    };
  });
}

/** Los proyectos que la persona ve, los más recientes primero. */
export async function clientProjects(
  tx: TenantTransaction,
  scope: ClientProjectScope,
): Promise<PortalProjectSummary[]> {
  const projects = await tx.prjProject.findMany({
    where: clientWhere(scope),
    orderBy: [{ startsOn: 'desc' }, { id: 'asc' }],
  });
  return summariesOf(tx, projects);
}

function deliverableView(
  deliverable: PrjDeliverable,
  milestones: ReadonlyMap<string, string>,
  acceptance: PrjAcceptance | undefined,
): PortalDeliverable {
  return {
    id: deliverable.id,
    name: deliverable.name,
    description: deliverable.description,
    version_label: deliverable.versionLabel,
    status: deliverableStatusSchema.parse(deliverable.status),
    milestone:
      deliverable.milestoneId === null ? null : (milestones.get(deliverable.milestoneId) ?? null),
    acceptance:
      acceptance === undefined
        ? null
        : {
            status: acceptanceStatusSchema.parse(acceptance.status),
            respond_by: toCalendarDate(acceptance.respondBy),
            delivered_at: acceptance.deliveredAt.toISOString(),
          },
  };
}

/** Los entregables ya entregados al cliente, con su acta más reciente. */
async function deliverablesOf(
  tx: TenantTransaction,
  projectId: string,
  milestones: readonly PrjMilestone[],
): Promise<PortalDeliverable[]> {
  const where = { projectId, deletedAt: null };
  const [deliverables, acceptances] = await Promise.all([
    tx.prjDeliverable.findMany({
      where: { ...where, status: { not: 'preparing' } },
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
    }),
    tx.prjAcceptance.findMany({ where, orderBy: [{ deliveredAt: 'desc' }, { id: 'desc' }] }),
  ]);
  const names = new Map(milestones.map((milestone) => [milestone.id, milestone.name]));
  return deliverables.map((deliverable) =>
    deliverableView(
      deliverable,
      names,
      acceptances.find((acceptance) => acceptance.deliverableId === deliverable.id),
    ),
  );
}

/** La ficha de un proyecto que la persona ve; si no, «no existe». */
export async function clientProject(
  tx: TenantTransaction,
  scope: ClientProjectScope,
  id: string,
): Promise<PortalProjectDetail> {
  const project = await tx.prjProject.findFirst({ where: { ...clientWhere(scope), id } });
  if (project === null) throw projectNotFound('El proyecto');
  const [summary] = await summariesOf(tx, [project]);
  if (summary === undefined) throw projectNotFound('El proyecto');
  const milestones = await milestonesOf(tx, [project.id]);
  return {
    ...summary,
    description: project.description,
    milestones: milestones.map(milestoneView),
    deliverables: await deliverablesOf(tx, project.id, milestones),
  };
}

/** Los próximos hitos pendientes de los proyectos que la persona ve. */
export async function clientUpcomingMilestones(
  tx: TenantTransaction,
  scope: ClientProjectScope,
  limit: number,
): Promise<{ projectId: string; project: string; name: string; dueOn: string }[]> {
  const rows = await tx.prjMilestone.findMany({
    where: { status: 'pending', deletedAt: null, project: clientWhere(scope) },
    include: { project: { select: { name: true } } },
    orderBy: [{ dueOn: 'asc' }, { id: 'asc' }],
    take: limit,
  });
  return rows.map((row) => ({
    projectId: row.projectId,
    project: row.project.name,
    name: row.name,
    dueOn: toCalendarDate(row.dueOn),
  }));
}

/** Cuántas actas de los proyectos que la persona ve esperan la respuesta del cliente. */
export async function clientAwaitingActs(
  tx: TenantTransaction,
  scope: ClientProjectScope,
): Promise<number> {
  return tx.prjAcceptance.count({
    where: { status: 'in_signature', deletedAt: null, project: clientWhere(scope) },
  });
}

/** Un documento del proyecto para el portal: su archivo, cómo se llama y de qué proyecto es. */
export interface ClientProjectDocument {
  readonly id: string;
  readonly fileId: string;
  readonly title: string;
  readonly code: string | null;
  readonly project: string;
  readonly datedAt: Date;
}

/** Las actas firmadas y los archivos compartidos de los proyectos que la persona ve. */
export async function clientProjectDocuments(
  tx: TenantTransaction,
  scope: ClientProjectScope,
): Promise<{ acts: ClientProjectDocument[]; shared: ClientProjectDocument[] }> {
  const project = clientWhere(scope);
  const include = { project: { select: { name: true } } } as const;
  const [acts, shared] = await Promise.all([
    tx.prjAcceptance.findMany({
      where: { signedFileId: { not: null }, deletedAt: null, project },
      include: { ...include, deliverable: { select: { name: true } } },
      orderBy: [{ answeredAt: 'desc' }, { id: 'asc' }],
    }),
    tx.prjSharedFile.findMany({
      where: { deletedAt: null, project },
      include,
      orderBy: [{ createdAt: 'desc' }, { id: 'asc' }],
    }),
  ]);
  return {
    acts: acts.map((act) => ({
      id: act.id,
      fileId: act.signedFileId ?? '',
      title: `Acta de entrega · ${act.deliverable.name}`,
      code: act.recordCode,
      project: act.project.name,
      datedAt: act.answeredAt ?? act.deliveredAt,
    })),
    shared: shared.map((file) => ({
      id: file.id,
      fileId: file.fileId,
      title: file.title,
      code: null,
      project: file.project.name,
      datedAt: file.createdAt,
    })),
  };
}

/** Los proyectos visibles de la empresa, para que su administrador los asigne. */
export async function companyProjects(
  tx: TenantTransaction,
  partyId: string,
): Promise<{ id: string; code: string; name: string }[]> {
  return tx.prjProject.findMany({
    where: companyWhere(partyId),
    select: { id: true, code: true, name: true },
    orderBy: [{ code: 'asc' }],
  });
}

/** Los proyectos asignados a cada usuario del cliente. */
export async function clientAccessByUser(
  tx: TenantTransaction,
  userIds: readonly string[],
): Promise<Map<string, string[]>> {
  const rows = await tx.prjClientAccess.findMany({
    where: { userId: { in: [...userIds] }, deletedAt: null },
    orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
  });
  const byUser = new Map<string, string[]>(userIds.map((id) => [id, []]));
  for (const row of rows) byUser.get(row.userId)?.push(row.projectId);
  return byUser;
}

import {
  projectStatusSchema,
  type PermissionCode,
  type ProjectDetail,
  type ProjectStatus,
} from '@arza/contracts';

import type { PrjProject, Prisma } from '../../../generated/prisma/client.js';
import {
  canOnRecord,
  hasPermission,
  hasUnconditionalPermission,
  type AppAbility,
} from '../../../platform/access/ability.js';
import type { Principal } from '../../../platform/access/principal.js';
import { permissionDenied } from '../../../platform/access/permission-denied.js';
import type { TenantTransaction } from '../../../platform/database/tenant-context.js';
import { versionConflict } from '../../../platform/http/if-match.js';
import { toCalendarDate } from '../../core/index.js';
import { projectClosed, projectNotFound, statusInvalid } from './project-messages.js';

// Lectura de un proyecto y quién puede hacer qué con él (B26, ficha 17.8). Quien solo ve «lo
// propio» (Equipo de proyecto) ve los proyectos donde es miembro activo; para los demás, un
// proyecto ajeno «no existe» (numeral 15.5). La pertenencia se lee en cada solicitud: retirar a un
// miembro le quita el acceso de inmediato.

export const PROJECT_SEQUENCE = 'prj.project';
export const PROJECTS = { name: 'Proyectos', prefix: 'PRY', padding: 4 } as const;

/** Un proyecto con los miembros activos de su equipo. */
export interface ProjectAccess {
  readonly project: PrjProject;
  readonly memberIds: readonly string[];
}

export async function findProject(tx: TenantTransaction, id: string): Promise<PrjProject> {
  const project = await tx.prjProject.findFirst({ where: { id, deletedAt: null } });
  if (project === null) throw projectNotFound('El proyecto');
  return project;
}

async function activeMemberIds(tx: TenantTransaction, projectId: string): Promise<string[]> {
  const members = await tx.prjMember.findMany({
    where: { projectId, deletedAt: null },
    select: { userId: true },
  });
  return members.map((member) => member.userId);
}

function involved(memberIds: readonly string[]) {
  return { involved_user_ids: [...memberIds] };
}

/** La persona ve todos los proyectos o es miembro activo de este. */
function canSeeProject(ability: AppAbility, memberIds: readonly string[]): boolean {
  return (
    canOnRecord(ability, 'project.read_all', {}) ||
    canOnRecord(ability, 'project.read_member', involved(memberIds))
  );
}

function canManageItems(ability: AppAbility, memberIds: readonly string[]): boolean {
  return canOnRecord(ability, 'project.item.manage', involved(memberIds));
}

/** El permiso sobre este proyecto: sobre todos, o solo donde la persona es miembro activo. */
export function canOnProject(
  ability: AppAbility,
  code: PermissionCode,
  memberIds: readonly string[],
): boolean {
  return canOnRecord(ability, code, involved(memberIds));
}

/** Ve el costo de la hora y la rentabilidad: quien ve todos los proyectos, no el equipo (B27). */
export function seesMoney(ability: AppAbility): boolean {
  return hasUnconditionalPermission(ability, 'project.read_all');
}

/** Qué puede hacer la persona en este proyecto, para que la pantalla no ofrezca lo imposible. */
export function projectAbilities(
  ability: AppAbility,
  userId: string,
  memberIds: readonly string[],
): ProjectDetail['can'] {
  return {
    update: hasPermission(ability, 'project.update'),
    manage_members: hasPermission(ability, 'project.member.manage'),
    manage_items: canManageItems(ability, memberIds),
    log_time: memberIds.includes(userId) && canOnProject(ability, 'project.time.log', memberIds),
    approve_time: hasPermission(ability, 'project.time.approve'),
    deliver: canOnProject(ability, 'project.deliverable.submit', memberIds),
    manage_releases: hasPermission(ability, 'project.release.manage'),
    manage_incidents: hasPermission(ability, 'project.incident.manage'),
    close: hasPermission(ability, 'project.close'),
    see_money: seesMoney(ability),
  };
}

/** El proyecto con su equipo, si la persona puede verlo; si no, «no existe». */
export async function findVisibleProject(
  tx: TenantTransaction,
  ability: AppAbility,
  id: string,
): Promise<ProjectAccess> {
  const project = await findProject(tx, id);
  const memberIds = await activeMemberIds(tx, id);
  if (!canSeeProject(ability, memberIds)) throw projectNotFound('El proyecto');
  return { project, memberIds };
}

/** Para los ítems: lo ve y, además, es del equipo (o gestiona todos los proyectos). */
export async function findProjectForItems(
  tx: TenantTransaction,
  ability: AppAbility,
  id: string,
): Promise<ProjectAccess> {
  const access = await findVisibleProject(tx, ability, id);
  if (!canManageItems(ability, access.memberIds)) throw permissionDenied();
  return access;
}

/** Filtro de la lista: todos, o solo donde la persona es miembro activo. */
export function visibleProjects(
  principal: Principal,
  ability: AppAbility,
): Prisma.PrjProjectWhereInput {
  if (
    hasUnconditionalPermission(ability, 'project.read_all') ||
    hasUnconditionalPermission(ability, 'project.read_member')
  ) {
    return {};
  }
  return { members: { some: { userId: principal.userId, deletedAt: null } } };
}

/**
 * Bloquea la fila del proyecto hasta el fin de la transacción: los pasos que numeran ítems, abren
 * iteraciones o arman el equipo no se pisan entre dos personas.
 */
export async function lockProject(tx: TenantTransaction, id: string): Promise<void> {
  await tx.$queryRaw`SELECT id FROM prj_projects WHERE id = ${id}::uuid FOR UPDATE`;
}

export function statusOf(project: Pick<PrjProject, 'status'>): ProjectStatus {
  return projectStatusSchema.parse(project.status);
}

/** Un proyecto cerrado solo se consulta (B27). */
export function assertOpen(project: Pick<PrjProject, 'status'>): void {
  if (statusOf(project) === 'closed') throw projectClosed();
}

/** El equipo trabaja: en ejecución o en riesgo. */
export function assertWorking(project: Pick<PrjProject, 'status'>, detail: string): void {
  const status = statusOf(project);
  if (status !== 'in_progress' && status !== 'at_risk') throw statusInvalid(detail);
}

export async function updateProjectVersioned(
  tx: TenantTransaction,
  target: { readonly id: string; readonly version: number },
  data: Prisma.PrjProjectUncheckedUpdateManyInput,
): Promise<void> {
  const { count } = await tx.prjProject.updateMany({
    where: { id: target.id, version: target.version, deletedAt: null },
    data,
  });
  if (count === 0) throw versionConflict();
}

/** Lo que guarda la auditoría del proyecto. */
export function projectAudit(project: PrjProject): Record<string, string | null> {
  return {
    code: project.code,
    name: project.name,
    status: project.status,
    contract_id: project.contractId,
    starts_on: toCalendarDate(project.startsOn),
    ends_on: toCalendarDate(project.endsOn),
    budget_hours: project.budgetHours.toFixed(1),
    budget_amount: project.budgetAmount === null ? null : project.budgetAmount.toFixed(2),
    manager_id: project.managerId,
  };
}

/** Datos del evento para avisar y para los módulos que lo consumen: nunca datos personales. */
export function projectPayload(project: PrjProject): Prisma.InputJsonObject {
  return { project_id: project.id, code: project.code, manager_id: project.managerId };
}

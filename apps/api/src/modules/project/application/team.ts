import type { PrjMember, PrjProject, Prisma } from '../../../generated/prisma/client.js';
import type { TenantTransaction } from '../../../platform/database/tenant-context.js';
import { activeUsersWithRoles } from '../../iam/index.js';
import { memberInvalid } from './project-messages.js';
import { recordProjectChange, type ProjectActor } from './project-support.js';

// El equipo del proyecto (B26, ficha 17.8). Solo entran colaboradores activos con un rol que trabaja
// en proyectos; el líder del proyecto siempre está en el equipo con el rol «Líder del proyecto», y
// solo él lo tiene.

/** Roles cuyos colaboradores pueden entrar a un equipo: los que ven proyectos y trabajan en ellos. */
export const TEAM_ROLES = [
  'LIDER_TECNICO',
  'EQUIPO_PROYECTO',
  'DIRECCION',
  'CALIDAD',
  'COMERCIAL',
  'SERVICIO',
] as const;

/** Quien entra al equipo debe ser colaborador activo con un rol que trabaja en proyectos. */
export async function assertTeamCandidate(
  tx: TenantTransaction,
  userId: string,
  now: Date,
): Promise<void> {
  const candidates = await activeUsersWithRoles(tx, TEAM_ROLES, now);
  if (!candidates.includes(userId)) {
    throw memberInvalid(
      'Elija un colaborador activo que trabaje en proyectos (Líder técnico, Equipo de proyecto u otro rol que los vea).',
    );
  }
}

export function memberAudit(member: PrjMember): Record<string, string | number> {
  return { user_id: member.userId, role: member.role, allocation_pct: member.allocationPct };
}

export function memberPayload(
  project: Pick<PrjProject, 'id' | 'code'>,
  member: PrjMember,
): Prisma.InputJsonObject {
  return { project_id: project.id, code: project.code, user_id: member.userId };
}

async function recordLeaderChange(
  tx: TenantTransaction,
  actor: ProjectActor,
  project: PrjProject,
  member: PrjMember,
  added: boolean,
): Promise<void> {
  await recordProjectChange(tx, actor, {
    action: added ? 'project.member.add' : 'project.member.update',
    event: added ? 'project.member.added' : 'project.member.updated',
    entityType: 'prj_member',
    entityId: member.id,
    changes: { project: project.code, ...memberAudit(member) },
    payload: memberPayload(project, member),
  });
}

/**
 * El líder del proyecto queda en el equipo con ese rol; quien lo era antes sigue en el equipo, en
 * Desarrollo. Al crear el proyecto no se audita aparte: lo cuenta el evento de creación.
 */
export async function ensureLeader(
  tx: TenantTransaction,
  actor: ProjectActor,
  project: PrjProject,
  options: { readonly audit: boolean } = { audit: true },
): Promise<void> {
  const members = await tx.prjMember.findMany({
    where: { projectId: project.id, deletedAt: null },
  });
  for (const former of members.filter(
    (member) => member.role === 'leader' && member.userId !== project.managerId,
  )) {
    const changed = await tx.prjMember.update({
      where: { id: former.id },
      data: { role: 'development' },
    });
    if (options.audit) await recordLeaderChange(tx, actor, project, changed, false);
  }
  const current = members.find((member) => member.userId === project.managerId);
  if (current?.role === 'leader') return;
  const leader =
    current === undefined
      ? await tx.prjMember.create({
          data: {
            tenantId: actor.tenantId,
            projectId: project.id,
            userId: project.managerId,
            role: 'leader',
            allocationPct: 100,
          },
        })
      : await tx.prjMember.update({ where: { id: current.id }, data: { role: 'leader' } });
  if (options.audit) await recordLeaderChange(tx, actor, project, leader, current === undefined);
}

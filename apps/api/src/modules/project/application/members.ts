import { Inject, Injectable } from '@nestjs/common';
import type { MemberRequest, UpdateMemberRequest } from '@arza/contracts';

import type { PrjMember } from '../../../generated/prisma/client.js';
import type { Principal } from '../../../platform/access/principal.js';
import { changesBetween } from '../../../platform/audit/audit-recorder.js';
import { CLOCK, type Clock } from '../../../platform/clock/clock.js';
import { DatabaseService } from '../../../platform/database/database.service.js';
import type { TenantTransaction } from '../../../platform/database/tenant-context.js';
import { versionConflict } from '../../../platform/http/if-match.js';
import type { RequestMeta } from '../../../platform/http/request-meta.js';
import { memberDuplicate, memberInvalid, projectNotFound } from './project-messages.js';
import { findProject, lockProject } from './project-records.js';
import {
  projectActorOf,
  recordProjectChange,
  type ProjectActor,
  type ProjectPartTarget,
} from './project-support.js';
import { assertTeamCandidate, memberAudit, memberPayload } from './team.js';

// El equipo del proyecto (B26, ficha 17.8): quién está, con qué rol y con qué dedicación. Retirar a
// alguien le quita el acceso de inmediato y le suelta los ítems abiertos que tenía a cargo. El rol
// «Líder del proyecto» se cambia editando el proyecto, no aquí.

const LEADER_HERE =
  'El líder del proyecto se cambia en «Editar proyecto»; aquí elija otro rol para la persona.';

async function findMember(tx: TenantTransaction, target: ProjectPartTarget): Promise<PrjMember> {
  const member = await tx.prjMember.findFirst({
    where: { id: target.id, projectId: target.projectId, deletedAt: null },
  });
  if (member === null) throw projectNotFound('El miembro del equipo');
  return member;
}

@Injectable()
export class MembersUseCase {
  constructor(
    @Inject(DatabaseService) private readonly database: DatabaseService,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  private actor(principal: Principal, meta: RequestMeta): ProjectActor {
    return projectActorOf(principal, meta, this.clock.now());
  }

  async add(
    principal: Principal,
    projectId: string,
    input: MemberRequest,
    meta: RequestMeta,
  ): Promise<string> {
    const actor = this.actor(principal, meta);
    if (input.role === 'leader') throw memberInvalid(LEADER_HERE);
    return this.database.withTenant(principal, async (tx) => {
      const project = await findProject(tx, projectId);
      await lockProject(tx, projectId);
      await assertTeamCandidate(tx, input.user_id, actor.at);
      const existing = await tx.prjMember.count({
        where: { projectId, userId: input.user_id, deletedAt: null },
      });
      if (existing > 0) throw memberDuplicate();
      const member = await tx.prjMember.create({
        data: {
          tenantId: actor.tenantId,
          projectId,
          userId: input.user_id,
          role: input.role,
          allocationPct: input.allocation_pct,
        },
      });
      await recordProjectChange(tx, actor, {
        action: 'project.member.add',
        event: 'project.member.added',
        entityType: 'prj_member',
        entityId: member.id,
        changes: { project: project.code, ...memberAudit(member) },
        payload: memberPayload(project, member),
      });
      return member.id;
    });
  }

  async update(
    principal: Principal,
    target: ProjectPartTarget,
    input: UpdateMemberRequest,
    meta: RequestMeta,
  ): Promise<void> {
    const actor = this.actor(principal, meta);
    await this.database.withTenant(principal, async (tx) => {
      const project = await findProject(tx, target.projectId);
      const before = await findMember(tx, target);
      const leaderChange = (before.role === 'leader') !== (input.role === 'leader');
      if (leaderChange) throw memberInvalid(LEADER_HERE);
      const { count } = await tx.prjMember.updateMany({
        where: { id: target.id, version: target.version, deletedAt: null },
        data: { role: input.role, allocationPct: input.allocation_pct },
      });
      if (count === 0) throw versionConflict();
      const after = await findMember(tx, target);
      await recordProjectChange(tx, actor, {
        action: 'project.member.update',
        event: 'project.member.updated',
        entityType: 'prj_member',
        entityId: target.id,
        changes: {
          project: project.code,
          ...changesBetween(memberAudit(before), memberAudit(after)),
        },
        payload: memberPayload(project, after),
      });
    });
  }

  /** Retira a la persona: pierde el acceso de inmediato y sus ítems abiertos quedan sin asignar. */
  async remove(principal: Principal, target: ProjectPartTarget, meta: RequestMeta): Promise<void> {
    const actor = this.actor(principal, meta);
    await this.database.withTenant(principal, async (tx) => {
      const project = await findProject(tx, target.projectId);
      const member = await findMember(tx, target);
      if (member.userId === project.managerId) {
        throw memberInvalid(
          'El líder del proyecto no se retira: primero asigne otro líder en «Editar proyecto».',
        );
      }
      const { count } = await tx.prjMember.updateMany({
        where: { id: target.id, version: target.version, deletedAt: null },
        data: { deletedAt: actor.at },
      });
      if (count === 0) throw versionConflict();
      const released = await tx.prjItem.updateMany({
        where: {
          projectId: project.id,
          assigneeId: member.userId,
          status: { not: 'done' },
          deletedAt: null,
        },
        data: { assigneeId: null },
      });
      await recordProjectChange(tx, actor, {
        action: 'project.member.remove',
        event: 'project.member.removed',
        entityType: 'prj_member',
        entityId: target.id,
        changes: { project: project.code, ...memberAudit(member), released_items: released.count },
        payload: memberPayload(project, member),
      });
    });
  }
}

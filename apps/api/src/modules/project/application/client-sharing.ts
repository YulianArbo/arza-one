import { Inject, Injectable } from '@nestjs/common';
import type { ShareFileRequest, SharedFileList } from '@arza/contracts';

import { hasPermission, type AppAbility } from '../../../platform/access/ability.js';
import type { Principal } from '../../../platform/access/principal.js';
import { CLOCK, type Clock } from '../../../platform/clock/clock.js';
import { DatabaseService } from '../../../platform/database/database.service.js';
import type { TenantTransaction } from '../../../platform/database/tenant-context.js';
import type { RequestMeta } from '../../../platform/http/request-meta.js';
import { isAttachableFile } from '../../doc/index.js';
import { companyProjects } from './client-projects.js';
import { projectNotFound, sharedFileDuplicate, sharedFileInvalid } from './project-messages.js';
import { findVisibleProject, updateProjectVersioned } from './project-records.js';
import {
  peopleNames,
  projectActorOf,
  recordProjectChange,
  type ProjectActor,
  type ProjectTarget,
} from './project-support.js';

// Lo que el equipo comparte con el cliente en el portal (B30, decisiones 2, 3 y 5): si el proyecto
// se ve allí, los archivos que se comparten a propósito y qué proyectos ve cada usuario del cliente
// (lo decide su administrador desde el portal). Nada se comparte por defecto.

/** El administrador del cliente asigna proyectos de su empresa a uno de sus usuarios. */
export async function setClientAccess(
  tx: TenantTransaction,
  actor: ProjectActor,
  target: { readonly userId: string; readonly partyId: string; readonly projectIds: string[] },
): Promise<void> {
  const allowed = new Set((await companyProjects(tx, target.partyId)).map((row) => row.id));
  const wanted = [...new Set(target.projectIds)];
  if (wanted.some((id) => !allowed.has(id))) throw projectNotFound('El proyecto');
  const current = await tx.prjClientAccess.findMany({
    where: { userId: target.userId, deletedAt: null },
  });
  const removed = current.filter((row) => !wanted.includes(row.projectId));
  const added = wanted.filter((id) => !current.some((row) => row.projectId === id));
  if (removed.length === 0 && added.length === 0) return;
  await tx.prjClientAccess.updateMany({
    where: { id: { in: removed.map((row) => row.id) } },
    data: { deletedAt: actor.at },
  });
  await tx.prjClientAccess.createMany({
    data: added.map((projectId) => ({
      tenantId: actor.tenantId,
      projectId,
      userId: target.userId,
    })),
  });
  await recordProjectChange(tx, actor, {
    action: 'project.client_access.set',
    event: 'project.client.access.changed',
    entityType: 'prj_client_access',
    entityId: target.userId,
    changes: { added, removed: removed.map((row) => row.projectId) },
    payload: { user_id: target.userId, party_id: target.partyId },
  });
}

@Injectable()
export class ClientSharingUseCase {
  constructor(
    @Inject(DatabaseService) private readonly database: DatabaseService,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  /** Si el proyecto se ve en el portal y lo compartido con el cliente. */
  async list(
    principal: Principal,
    ability: AppAbility,
    projectId: string,
  ): Promise<SharedFileList> {
    return this.database.withTenant(principal, async (tx) => {
      const { project } = await findVisibleProject(tx, ability, projectId);
      const files = await tx.prjSharedFile.findMany({
        where: { projectId, deletedAt: null },
        orderBy: [{ createdAt: 'desc' }, { id: 'asc' }],
      });
      const names = await peopleNames(
        tx,
        files.map((file) => file.sharedBy),
      );
      return {
        visible: project.portalVisible,
        can_share: hasPermission(ability, 'project.update'),
        data: files.map((file) => ({
          id: file.id,
          file_id: file.fileId,
          title: file.title,
          shared_by: { id: file.sharedBy, name: names.get(file.sharedBy) ?? 'Colaborador' },
          shared_at: file.createdAt.toISOString(),
        })),
      };
    });
  }

  /** El líder deja ver u oculta el proyecto en el portal. */
  async setVisible(
    principal: Principal,
    ability: AppAbility,
    target: ProjectTarget,
    visible: boolean,
    meta: RequestMeta,
  ): Promise<void> {
    const actor = projectActorOf(principal, meta, this.clock.now());
    await this.database.withTenant(principal, async (tx) => {
      const { project } = await findVisibleProject(tx, ability, target.id);
      await updateProjectVersioned(tx, target, { portalVisible: visible });
      await recordProjectChange(tx, actor, {
        action: 'project.portal.visibility',
        event: 'project.portal.changed',
        entityType: 'prj_project',
        entityId: project.id,
        changes: { code: project.code, portal_visible: [project.portalVisible, visible] },
        payload: { project_id: project.id, code: project.code, visible },
      });
    });
  }

  /** Comparte con el cliente un archivo que la persona subió y pasó el antivirus. */
  async share(
    principal: Principal,
    ability: AppAbility,
    projectId: string,
    input: ShareFileRequest,
    meta: RequestMeta,
  ): Promise<string> {
    const actor = projectActorOf(principal, meta, this.clock.now());
    return this.database.withTenant(principal, async (tx) => {
      const { project } = await findVisibleProject(tx, ability, projectId);
      if (!(await isAttachableFile(tx, principal, input.file_id))) throw sharedFileInvalid();
      const live = { projectId, fileId: input.file_id, deletedAt: null };
      if ((await tx.prjSharedFile.count({ where: live })) > 0) throw sharedFileDuplicate();
      const shared = await tx.prjSharedFile.create({
        data: {
          tenantId: actor.tenantId,
          projectId,
          fileId: input.file_id,
          title: input.title,
          sharedBy: principal.userId,
        },
      });
      await this.record(tx, actor, 'share', {
        id: shared.id,
        project: project.code,
        fileId: shared.fileId,
      });
      return shared.id;
    });
  }

  /** Deja de compartir: el cliente ya no lo ve; el archivo sigue en el expediente. */
  async unshare(
    principal: Principal,
    ability: AppAbility,
    target: { readonly projectId: string; readonly id: string },
    meta: RequestMeta,
  ): Promise<void> {
    const actor = projectActorOf(principal, meta, this.clock.now());
    await this.database.withTenant(principal, async (tx) => {
      const { project } = await findVisibleProject(tx, ability, target.projectId);
      const { count } = await tx.prjSharedFile.updateMany({
        where: { id: target.id, projectId: project.id, deletedAt: null },
        data: { deletedAt: actor.at },
      });
      if (count === 0) throw projectNotFound('El archivo compartido');
      await this.record(tx, actor, 'unshare', {
        id: target.id,
        project: project.code,
        fileId: null,
      });
    });
  }

  private async record(
    tx: TenantTransaction,
    actor: ProjectActor,
    step: 'share' | 'unshare',
    file: { readonly id: string; readonly project: string; readonly fileId: string | null },
  ): Promise<void> {
    await recordProjectChange(tx, actor, {
      action: `project.file.${step}`,
      event: step === 'share' ? 'project.file.shared' : 'project.file.unshared',
      entityType: 'prj_shared_file',
      entityId: file.id,
      changes: { project: file.project, file_id: file.fileId },
      payload: { code: file.project },
    });
  }
}

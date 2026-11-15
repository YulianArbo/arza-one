import { Inject, Injectable } from '@nestjs/common';
import type { CloseProjectRequest, ControlSettingsRequest } from '@arza/contracts';

import type { Principal } from '../../../platform/access/principal.js';
import { CLOCK, type Clock } from '../../../platform/clock/clock.js';
import { DatabaseService } from '../../../platform/database/database.service.js';
import type { TenantTransaction } from '../../../platform/database/tenant-context.js';
import type { RequestMeta } from '../../../platform/http/request-meta.js';
import { canTakeStep } from '../domain/project-rules.js';
import { closingProblems, type ClosingCounts } from '../domain/control-rules.js';
import { closingBlocked, statusInvalid } from './project-messages.js';
import {
  assertOpen,
  findProject,
  projectAudit,
  projectPayload,
  statusOf,
  updateProjectVersioned,
} from './project-records.js';
import {
  projectActorOf,
  recordProjectChange,
  type ProjectActor,
  type ProjectTarget,
} from './project-support.js';

// Configuración del control y cierre del proyecto (B27, ficha 17.8). El líder define el costo de
// la hora (para la rentabilidad), el plazo del cliente para responder las actas y si el contrato
// prevé la aceptación tácita. El Líder técnico pasa el proyecto a cierre y lo cierra con las
// lecciones aprendidas cuando el cliente aceptó todos los entregables, no quedan incidentes
// abiertos ni horas por aprobar. Cerrado, solo se consulta.

/** Lo que aún impide cerrar el proyecto. */
async function closingCounts(tx: TenantTransaction, projectId: string): Promise<ClosingCounts> {
  const where = { projectId, deletedAt: null };
  const [deliverablesOpen, incidentsOpen, hoursPending] = await Promise.all([
    tx.prjDeliverable.count({ where: { ...where, status: { not: 'accepted' } } }),
    tx.prjIncident.count({ where: { ...where, status: 'open' } }),
    tx.prjTimeEntry.count({ where: { ...where, status: { in: ['registered', 'returned'] } } }),
  ]);
  return { deliverablesOpen, incidentsOpen, hoursPending };
}

@Injectable()
export class ClosingUseCase {
  constructor(
    @Inject(DatabaseService) private readonly database: DatabaseService,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  private actor(principal: Principal, meta: RequestMeta): ProjectActor {
    return projectActorOf(principal, meta, this.clock.now());
  }

  async updateSettings(
    principal: Principal,
    target: ProjectTarget,
    input: ControlSettingsRequest,
    meta: RequestMeta,
  ): Promise<void> {
    const actor = this.actor(principal, meta);
    await this.database.withTenant(principal, async (tx) => {
      const project = await findProject(tx, target.id);
      assertOpen(project);
      await updateProjectVersioned(tx, target, {
        hourCost: input.hour_cost,
        respondDays: input.respond_days,
        tacitAcceptance: input.tacit_acceptance,
        tacitClause: input.tacit_acceptance ? input.tacit_clause : null,
      });
      await recordProjectChange(tx, actor, {
        action: 'project.settings.update',
        event: 'project.updated',
        entityType: 'prj_project',
        entityId: project.id,
        changes: {
          code: project.code,
          hour_cost: [project.hourCost?.toFixed(2) ?? null, input.hour_cost],
          respond_days: [project.respondDays, input.respond_days],
          tacit_acceptance: [project.tacitAcceptance, input.tacit_acceptance],
          tacit_clause: input.tacit_acceptance ? input.tacit_clause : null,
        },
        payload: projectPayload(project),
      });
    });
  }

  /** En ejecución o en riesgo → en cierre: el equipo termina lo pendiente. */
  async startClosing(
    principal: Principal,
    target: ProjectTarget,
    meta: RequestMeta,
  ): Promise<void> {
    const actor = this.actor(principal, meta);
    await this.database.withTenant(principal, async (tx) => {
      const project = await findProject(tx, target.id);
      const from = statusOf(project);
      if (!canTakeStep('closing', from)) {
        throw statusInvalid('Solo pasa a cierre un proyecto en ejecución o en riesgo.');
      }
      await updateProjectVersioned(tx, target, {
        status: 'closing',
        statusReason: null,
        closingStartedAt: actor.at,
      });
      await recordProjectChange(tx, actor, {
        action: 'project.closing',
        event: 'project.status.changed',
        entityType: 'prj_project',
        entityId: project.id,
        changes: { ...projectAudit(project), status: [from, 'closing'] },
        payload: { ...projectPayload(project), status: 'closing' },
      });
    });
  }

  /** En cierre → cerrado, con las lecciones aprendidas y sin nada pendiente. */
  async close(
    principal: Principal,
    target: ProjectTarget,
    input: CloseProjectRequest,
    meta: RequestMeta,
  ): Promise<void> {
    const actor = this.actor(principal, meta);
    await this.database.withTenant(principal, async (tx) => {
      const project = await findProject(tx, target.id);
      if (!canTakeStep('close', statusOf(project))) {
        throw statusInvalid('Pase primero el proyecto a cierre.');
      }
      const problems = closingProblems(await closingCounts(tx, project.id));
      if (problems.length > 0) throw closingBlocked(problems);
      await updateProjectVersioned(tx, target, {
        status: 'closed',
        closedAt: actor.at,
        closingNote: input.lessons,
      });
      await recordProjectChange(tx, actor, {
        action: 'project.close',
        event: 'project.closed',
        entityType: 'prj_project',
        entityId: project.id,
        changes: { ...projectAudit(project), status: ['closing', 'closed'] },
        payload: { ...projectPayload(project), status: 'closed' },
      });
    });
  }
}

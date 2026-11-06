import { Inject, Injectable } from '@nestjs/common';
import type { IncidentRequest, ResolveIncidentRequest } from '@arza/contracts';

import type { PrjIncident, PrjProject } from '../../../generated/prisma/client.js';
import type { Principal } from '../../../platform/access/principal.js';
import { CLOCK, type Clock } from '../../../platform/clock/clock.js';
import { DatabaseService } from '../../../platform/database/database.service.js';
import type { TenantTransaction } from '../../../platform/database/tenant-context.js';
import { versionConflict } from '../../../platform/http/if-match.js';
import type { RequestMeta } from '../../../platform/http/request-meta.js';
import { nextBusinessCode } from '../../core/index.js';
import { datesInvalid, projectNotFound, statusInvalid } from './project-messages.js';
import { assertOpen, findProject } from './project-records.js';
import {
  projectActorOf,
  recordProjectChange,
  type ProjectActor,
  type ProjectPartTarget,
} from './project-support.js';

// Incidentes críticos y de seguridad (B27, FT-TEC-004, PR-TEC-004 y numeral 15): el Líder técnico
// los registra con su gravedad y, al resolverlos, la causa raíz y las acciones. Si se comprometieron
// datos personales, el Oficial de datos recibe el aviso: el reporte a la SIC va dentro de los quince
// días hábiles siguientes a la detección (decisión 12).

const INCIDENT_SEQUENCE = 'prj.incident';
const INCIDENTS = { name: 'Incidentes de proyectos', prefix: 'INC', padding: 4 } as const;

function incidentAudit(incident: PrjIncident): Record<string, string | boolean | null> {
  return {
    code: incident.code,
    kind: incident.kind,
    severity: incident.severity,
    status: incident.status,
    personal_data: incident.personalData,
    detected_at: incident.detectedAt.toISOString(),
  };
}

function incidentPayload(project: PrjProject, incident: PrjIncident) {
  return {
    project_id: project.id,
    code: project.code,
    incident_code: incident.code,
    personal_data: incident.personalData,
    manager_id: project.managerId,
  };
}

async function openIncident(
  tx: TenantTransaction,
  target: { readonly id: string; readonly projectId: string },
): Promise<PrjIncident> {
  const incident = await tx.prjIncident.findFirst({
    where: { id: target.id, projectId: target.projectId, deletedAt: null },
  });
  if (incident === null) throw projectNotFound('El incidente');
  if (incident.status === 'resolved') throw statusInvalid('El incidente ya está resuelto.');
  return incident;
}

@Injectable()
export class IncidentsUseCase {
  constructor(
    @Inject(DatabaseService) private readonly database: DatabaseService,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  private actor(principal: Principal, meta: RequestMeta): ProjectActor {
    return projectActorOf(principal, meta, this.clock.now());
  }

  async report(
    principal: Principal,
    projectId: string,
    input: IncidentRequest,
    meta: RequestMeta,
  ): Promise<string> {
    const actor = this.actor(principal, meta);
    return this.database.withTenant(principal, async (tx) => {
      const project = await findProject(tx, projectId);
      assertOpen(project);
      const detectedAt = new Date(input.detected_at);
      if (detectedAt > actor.at) throw datesInvalid('La detección no puede ser en el futuro.');
      const incident = await tx.prjIncident.create({
        data: {
          tenantId: actor.tenantId,
          projectId,
          code: await nextBusinessCode(tx, INCIDENT_SEQUENCE, actor.at, INCIDENTS),
          title: input.title,
          kind: input.kind,
          severity: input.severity,
          description: input.description,
          detectedAt,
          personalData: input.personal_data,
          reportedBy: principal.userId,
        },
      });
      await recordProjectChange(tx, actor, {
        action: 'project.incident.report',
        event: 'project.incident.reported',
        entityType: 'prj_incident',
        entityId: incident.id,
        changes: { project: project.code, ...incidentAudit(incident) },
        payload: incidentPayload(project, incident),
      });
      return incident.id;
    });
  }

  async resolve(
    principal: Principal,
    target: ProjectPartTarget,
    input: ResolveIncidentRequest,
    meta: RequestMeta,
  ): Promise<void> {
    const actor = this.actor(principal, meta);
    await this.database.withTenant(principal, async (tx) => {
      const project = await findProject(tx, target.projectId);
      assertOpen(project);
      const incident = await openIncident(tx, target);
      const resolvedAt = new Date(input.resolved_at);
      if (resolvedAt < incident.detectedAt || resolvedAt > actor.at) {
        throw datesInvalid('La solución va entre la detección y ahora.');
      }
      const { count } = await tx.prjIncident.updateMany({
        where: { id: target.id, version: target.version, deletedAt: null },
        data: {
          status: 'resolved',
          resolvedAt,
          rootCause: input.root_cause,
          actions: input.actions,
        },
      });
      if (count === 0) throw versionConflict();
      await recordProjectChange(tx, actor, {
        action: 'project.incident.resolve',
        event: 'project.incident.resolved',
        entityType: 'prj_incident',
        entityId: incident.id,
        changes: {
          project: project.code,
          ...incidentAudit(incident),
          status: ['open', 'resolved'],
          resolved_at: input.resolved_at,
        },
        payload: incidentPayload(project, incident),
      });
    });
  }
}

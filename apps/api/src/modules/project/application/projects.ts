import { Inject, Injectable } from '@nestjs/common';
import type {
  CreateProjectRequest,
  ProjectReasonRequest,
  UpdateProjectRequest,
} from '@arza/contracts';

import type { PrjProject } from '../../../generated/prisma/client.js';
import type { Principal } from '../../../platform/access/principal.js';
import { changesBetween } from '../../../platform/audit/audit-recorder.js';
import { CLOCK, type Clock } from '../../../platform/clock/clock.js';
import { DatabaseService } from '../../../platform/database/database.service.js';
import type { TenantTransaction } from '../../../platform/database/tenant-context.js';
import type { RequestMeta } from '../../../platform/http/request-meta.js';
import { contractsForProjects, isInForce } from '../../contract/index.js';
import { fromCalendarDate, nextBusinessCode } from '../../core/index.js';
import { commercialParties } from '../../party/index.js';
import {
  canTakeStep,
  periodProblem,
  PROJECT_STEPS,
  type ProjectStep,
} from '../domain/project-rules.js';
import { startAuthorization } from './project-authorization.js';
import {
  authorizationRequired,
  contractInvalid,
  datesInvalid,
  partyInvalid,
  statusInvalid,
} from './project-messages.js';
import {
  findProject,
  PROJECT_SEQUENCE,
  PROJECTS,
  projectAudit,
  projectPayload,
  assertOpen,
  statusOf,
  updateProjectVersioned,
} from './project-records.js';
import {
  projectActorOf,
  recordProjectChange,
  type ProjectActor,
  type ProjectTarget,
} from './project-support.js';
import { assertTeamCandidate, ensureLeader } from './team.js';

// Proyectos (B26, ficha 17.8): se crean desde un contrato vigente o, sin él, para un cliente de
// Terceros; en ese caso no se inician sin la autorización expresa de la Dirección. El líder del
// proyecto queda en el equipo con ese rol. Código PRY-AAAA-NNNN por el servicio de consecutivos.

const STEP_LABELS: Readonly<Record<ProjectStep, string>> = {
  start: 'Solo se inicia un proyecto en planeación.',
  risk: 'Solo se marca en riesgo un proyecto en ejecución.',
  pause: 'Solo se pausa un proyecto en ejecución o en riesgo.',
  resume: 'Solo se reanuda un proyecto en riesgo, pausado o en cierre.',
  closing: 'Solo pasa a cierre un proyecto en ejecución o en riesgo.',
  close: 'Solo se cierra un proyecto que está en cierre.',
};

/** El cliente y el contrato del proyecto nuevo, revisados. */
interface Origin {
  readonly partyId: string;
  readonly contractId: string | null;
  readonly contractValue: string | null;
}

async function originOf(tx: TenantTransaction, input: CreateProjectRequest): Promise<Origin> {
  if (input.contract_id === null) {
    if (input.party_id === null) throw partyInvalid();
    const party = (await commercialParties(tx, [input.party_id])).get(input.party_id);
    if (party?.isUsable !== true) throw partyInvalid();
    return { partyId: party.id, contractId: null, contractValue: null };
  }
  const contract = (await contractsForProjects(tx, [input.contract_id])).get(input.contract_id);
  const taken = await tx.prjProject.count({
    where: { contractId: input.contract_id, deletedAt: null },
  });
  if (contract === undefined || !isInForce(contract) || taken > 0) throw contractInvalid();
  if (input.party_id !== null && input.party_id !== contract.partyId) throw partyInvalid();
  return { partyId: contract.partyId, contractId: contract.id, contractValue: contract.value };
}

function assertDates(input: UpdateProjectRequest): void {
  const problem = periodProblem(
    { startsOn: input.starts_on, endsOn: input.ends_on },
    'El proyecto',
  );
  if (problem !== null) throw datesInvalid(problem);
}

function projectData(input: UpdateProjectRequest) {
  return {
    name: input.name,
    type: input.type,
    methodology: input.methodology,
    description: input.description,
    startsOn: fromCalendarDate(input.starts_on),
    endsOn: fromCalendarDate(input.ends_on),
    budgetHours: input.budget_hours,
    managerId: input.manager_id,
  };
}

/** Sin contrato vigente, solo con la autorización de la Dirección. */
async function assertMayStart(tx: TenantTransaction, project: PrjProject): Promise<void> {
  if (project.authorizationStatus === 'granted') return;
  if (project.contractId !== null) {
    const contract = (await contractsForProjects(tx, [project.contractId])).get(project.contractId);
    if (contract !== undefined && isInForce(contract)) return;
  }
  throw authorizationRequired();
}

/** Se pide una vez, para un proyecto en planeación cuyo contrato no rige (o que no tiene). */
async function assertMayRequest(tx: TenantTransaction, project: PrjProject): Promise<void> {
  if (statusOf(project) !== 'planning' || project.authorizationStatus === 'requested') {
    throw statusInvalid(
      'La autorización se pide una vez, para un proyecto en planeación sin contrato vigente.',
    );
  }
  if (project.contractId === null) return;
  const contract = (await contractsForProjects(tx, [project.contractId])).get(project.contractId);
  if (contract !== undefined && isInForce(contract)) {
    throw statusInvalid('El contrato está vigente: inicie el proyecto sin pedir autorización.');
  }
}

@Injectable()
export class ProjectsUseCase {
  constructor(
    @Inject(DatabaseService) private readonly database: DatabaseService,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  private actor(principal: Principal, meta: RequestMeta): ProjectActor {
    return projectActorOf(principal, meta, this.clock.now());
  }

  async create(
    principal: Principal,
    input: CreateProjectRequest,
    meta: RequestMeta,
  ): Promise<string> {
    const actor = this.actor(principal, meta);
    assertDates(input);
    return this.database.withTenant(principal, async (tx) => {
      const origin = await originOf(tx, input);
      await assertTeamCandidate(tx, input.manager_id, actor.at);
      const project = await tx.prjProject.create({
        data: {
          tenantId: actor.tenantId,
          code: await nextBusinessCode(tx, PROJECT_SEQUENCE, actor.at, PROJECTS),
          contractId: origin.contractId,
          partyId: origin.partyId,
          ...projectData(input),
          budgetAmount: input.budget_amount ?? origin.contractValue,
        },
      });
      await ensureLeader(tx, actor, project, { audit: false });
      await recordProjectChange(tx, actor, {
        action: 'project.create',
        event: 'project.created',
        entityType: 'prj_project',
        entityId: project.id,
        changes: projectAudit(project),
        payload: projectPayload(project),
      });
      return project.id;
    });
  }

  async update(
    principal: Principal,
    target: ProjectTarget,
    input: UpdateProjectRequest,
    meta: RequestMeta,
  ): Promise<void> {
    const actor = this.actor(principal, meta);
    assertDates(input);
    await this.database.withTenant(principal, async (tx) => {
      const before = await findProject(tx, target.id);
      assertOpen(before);
      if (input.manager_id !== before.managerId) {
        await assertTeamCandidate(tx, input.manager_id, actor.at);
      }
      await updateProjectVersioned(tx, target, {
        ...projectData(input),
        budgetAmount: input.budget_amount,
      });
      const after = await findProject(tx, target.id);
      await ensureLeader(tx, actor, after);
      await recordProjectChange(tx, actor, {
        action: 'project.update',
        event: 'project.updated',
        entityType: 'prj_project',
        entityId: target.id,
        changes: changesBetween(projectAudit(before), projectAudit(after)),
        payload: projectPayload(after),
      });
    });
  }

  /** Iniciar, marcar en riesgo, pausar o reanudar; en riesgo y pausado llevan su motivo. */
  async step(
    principal: Principal,
    target: ProjectTarget,
    step: ProjectStep,
    input: ProjectReasonRequest | null,
    meta: RequestMeta,
  ): Promise<void> {
    const actor = this.actor(principal, meta);
    await this.database.withTenant(principal, async (tx) => {
      const project = await findProject(tx, target.id);
      const from = statusOf(project);
      if (!canTakeStep(step, from)) throw statusInvalid(STEP_LABELS[step]);
      if (step === 'start') await assertMayStart(tx, project);
      const to = PROJECT_STEPS[step].to;
      await updateProjectVersioned(tx, target, {
        status: to,
        statusReason: input?.reason ?? null,
        ...(step === 'start' ? { startedAt: actor.at } : {}),
        // Reanudar desde «en cierre» lo devuelve a ejecución (B27).
        ...(step === 'resume' ? { closingStartedAt: null } : {}),
      });
      await recordProjectChange(tx, actor, {
        action: `project.${step}`,
        event: step === 'start' ? 'project.started' : 'project.status.changed',
        entityType: 'prj_project',
        entityId: project.id,
        changes: { ...projectAudit(project), status: [from, to], reason: input?.reason ?? null },
        payload: { ...projectPayload(project), status: to },
      });
    });
  }

  /** Sin contrato vigente: la Dirección recibe la tarea de autorizar el inicio. */
  async requestAuthorization(
    principal: Principal,
    target: ProjectTarget,
    input: ProjectReasonRequest,
    meta: RequestMeta,
  ): Promise<void> {
    const actor = this.actor(principal, meta);
    await this.database.withTenant(principal, async (tx) => {
      const project = await findProject(tx, target.id);
      await assertMayRequest(tx, project);
      const instanceId = await startAuthorization(tx, actor, project);
      await updateProjectVersioned(tx, target, {
        authorizationStatus: 'requested',
        authorizationReason: input.reason,
        authorizationNote: null,
        authorizationDecidedBy: null,
        authorizationDecidedAt: null,
        workflowInstanceId: instanceId,
      });
      await recordProjectChange(tx, actor, {
        action: 'project.authorization.request',
        event: 'project.authorization.requested',
        entityType: 'prj_project',
        entityId: project.id,
        changes: {
          ...projectAudit(project),
          authorization_status: [project.authorizationStatus, 'requested'],
          reason: input.reason,
        },
        payload: projectPayload(project),
      });
    });
  }
}

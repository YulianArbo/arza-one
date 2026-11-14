import { Inject, Injectable } from '@nestjs/common';
import type {
  PersonRef,
  ProjectDetail,
  ProjectListQuery,
  ProjectListResponse,
  ProjectOptions,
  ProjectProgress,
} from '@arza/contracts';

import type { PrjProject, Prisma } from '../../../generated/prisma/client.js';
import type { AppAbility } from '../../../platform/access/ability.js';
import type { Principal } from '../../../platform/access/principal.js';
import { CLOCK, type Clock } from '../../../platform/clock/clock.js';
import { DatabaseService } from '../../../platform/database/database.service.js';
import type { TenantTransaction } from '../../../platform/database/tenant-context.js';
import { contractsForProjects, contractsInForce } from '../../contract/index.js';
import { activeUsersWithRoles } from '../../iam/index.js';
import { commercialParties, matchingPartyIds } from '../../party/index.js';
import { progressOf } from '../domain/project-rules.js';
import { findVisibleProject, projectAbilities, visibleProjects } from './project-records.js';
import { peopleNames } from './project-support.js';
import { TEAM_ROLES } from './team.js';
import { detailView, summaryView, type ProjectContext } from './project-views.js';

// Lista y ficha de los proyectos (B26) y lo que necesita el asistente para crear uno.

async function searchOf(
  tx: TenantTransaction,
  query: ProjectListQuery,
): Promise<Prisma.PrjProjectWhereInput> {
  const filters: Prisma.PrjProjectWhereInput =
    query.status === undefined ? {} : { status: query.status };
  if (query.q === undefined) return filters;
  const contains = { contains: query.q, mode: 'insensitive' } as const;
  const partyIds = await matchingPartyIds(tx, query.q);
  return {
    ...filters,
    OR: [{ code: contains }, { name: contains }, { partyId: { in: partyIds } }],
  };
}

/** Avance de cada proyecto: ítems de trabajo terminados sobre planeados. */
export async function progressByProject(
  tx: TenantTransaction,
  projectIds: readonly string[],
): Promise<Map<string, ProjectProgress>> {
  const counts = await tx.prjItem.groupBy({
    by: ['projectId', 'status'],
    where: { projectId: { in: [...projectIds] }, type: { not: 'epic' }, deletedAt: null },
    _count: { _all: true },
  });
  return new Map(
    projectIds.map((id) => {
      const rows = counts.filter((row) => row.projectId === id);
      const planned = rows.reduce((sum, row) => sum + row._count._all, 0);
      const done = rows.find((row) => row.status === 'done')?._count._all ?? 0;
      return [id, progressOf(planned, done)];
    }),
  );
}

/** Nombres, clientes, contratos y avance de los proyectos, para mostrarlos. */
async function contextsOf(
  tx: TenantTransaction,
  projects: readonly PrjProject[],
  people: readonly (string | null)[] = [],
): Promise<Map<string, ProjectContext>> {
  const [names, parties, contracts, progress] = await Promise.all([
    peopleNames(tx, [...projects.map((project) => project.managerId), ...people]),
    commercialParties(
      tx,
      projects.map((project) => project.partyId),
    ),
    contractsForProjects(
      tx,
      projects.flatMap((project) => (project.contractId === null ? [] : [project.contractId])),
    ),
    progressByProject(
      tx,
      projects.map((project) => project.id),
    ),
  ]);
  return new Map(
    projects.map((project) => [
      project.id,
      {
        names,
        partyName: parties.get(project.partyId)?.name ?? 'Cliente',
        contract: project.contractId === null ? null : (contracts.get(project.contractId) ?? null),
        progress: progress.get(project.id) ?? progressOf(0, 0),
      },
    ]),
  );
}

/** Lo que muestra la ficha de un proyecto, con los nombres de las personas indicadas. */
async function contextOf(
  tx: TenantTransaction,
  project: PrjProject,
  people: readonly (string | null)[],
): Promise<ProjectContext> {
  const context = (await contextsOf(tx, [project], people)).get(project.id);
  if (context === undefined) throw new Error('El proyecto quedó sin contexto.');
  return context;
}

/** El equipo, los hitos, las iteraciones (con cuántos ítems tiene cada una) y los enlaces. */
async function partsOf(tx: TenantTransaction, projectId: string) {
  const where = { projectId, deletedAt: null };
  const [members, milestones, sprints, links, sprintCounts] = await Promise.all([
    tx.prjMember.findMany({ where, orderBy: [{ createdAt: 'asc' }, { id: 'asc' }] }),
    tx.prjMilestone.findMany({ where, orderBy: [{ dueOn: 'asc' }, { id: 'asc' }] }),
    tx.prjSprint.findMany({ where, orderBy: [{ startsOn: 'asc' }, { id: 'asc' }] }),
    tx.prjExternalLink.findMany({ where, orderBy: [{ createdAt: 'asc' }, { id: 'asc' }] }),
    tx.prjItem.groupBy({
      by: ['sprintId'],
      where: { ...where, sprintId: { not: null } },
      _count: { _all: true },
    }),
  ]);
  const sprintRows = sprints.map((sprint) => ({
    sprint,
    items: sprintCounts.find((row) => row.sprintId === sprint.id)?._count._all ?? 0,
  }));
  return { members, milestones, sprints: sprintRows, links };
}

async function teamCandidates(tx: TenantTransaction, now: Date): Promise<PersonRef[]> {
  const ids = await activeUsersWithRoles(tx, TEAM_ROLES, now);
  const names = await peopleNames(tx, ids);
  return ids
    .map((id) => ({ id, name: names.get(id) ?? 'Colaborador' }))
    .sort((a, b) => a.name.localeCompare(b.name, 'es'));
}

@Injectable()
export class ProjectQueries {
  constructor(
    @Inject(DatabaseService) private readonly database: DatabaseService,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  async list(
    principal: Principal,
    ability: AppAbility,
    query: ProjectListQuery,
  ): Promise<ProjectListResponse> {
    return this.database.withTenant(principal, async (tx) => {
      const rows = await tx.prjProject.findMany({
        where: {
          deletedAt: null,
          AND: [visibleProjects(principal, ability), await searchOf(tx, query)],
        },
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        take: query.limit + 1,
        ...(query.cursor === undefined ? {} : { cursor: { id: query.cursor }, skip: 1 }),
      });
      const page = rows.slice(0, query.limit);
      const next = rows.length > query.limit ? (page.at(-1)?.id ?? null) : null;
      const contexts = await contextsOf(tx, page);
      const data = page.flatMap((project) => {
        const context = contexts.get(project.id);
        return context === undefined ? [] : [summaryView(project, context)];
      });
      return { data, next_cursor: next };
    });
  }

  async detail(principal: Principal, ability: AppAbility, id: string): Promise<ProjectDetail> {
    return this.database.withTenant(principal, async (tx) => {
      const { project, memberIds } = await findVisibleProject(tx, ability, id);
      const parts = await partsOf(tx, id);
      const context = await contextOf(tx, project, [
        project.authorizationDecidedBy,
        ...parts.members.map((member) => member.userId),
      ]);
      return detailView(project, context, {
        ...parts,
        can: projectAbilities(ability, principal.userId, memberIds),
      });
    });
  }

  /** Contratos vigentes que aún no tienen proyecto y quién puede entrar al equipo. */
  async options(principal: Principal): Promise<ProjectOptions> {
    return this.database.withTenant(principal, async (tx) => {
      const [contracts, taken, people] = await Promise.all([
        contractsInForce(tx),
        tx.prjProject.findMany({
          where: { contractId: { not: null }, deletedAt: null },
          select: { contractId: true },
        }),
        teamCandidates(tx, this.clock.now()),
      ]);
      const used = new Set(taken.map((row) => row.contractId));
      const free = contracts.filter((contract) => !used.has(contract.id));
      const parties = await commercialParties(
        tx,
        free.map((contract) => contract.partyId),
      );
      return {
        contracts: free.map((contract) => ({
          id: contract.id,
          code: contract.code,
          title: contract.title,
          party: { id: contract.partyId, name: parties.get(contract.partyId)?.name ?? 'Cliente' },
          starts_on: contract.startsOn,
          ends_on: contract.endsOn,
          value: contract.value,
        })),
        people,
      };
    });
  }
}

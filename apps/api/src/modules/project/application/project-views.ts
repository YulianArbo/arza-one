import {
  authorizationStatusSchema,
  itemPrioritySchema,
  itemStatusSchema,
  itemTypeSchema,
  linkKindSchema,
  memberRoleSchema,
  milestoneStatusSchema,
  projectMethodologySchema,
  projectTypeSchema,
  sprintStatusSchema,
  type ProjectDetail,
  type ProjectItem,
  type ProjectLink,
  type ProjectMember,
  type ProjectMilestone,
  type ProjectProgress,
  type ProjectSprint,
  type ProjectSummary,
} from '@arza/contracts';

import type {
  PrjExternalLink,
  PrjItem,
  PrjMember,
  PrjMilestone,
  PrjProject,
  PrjSprint,
} from '../../../generated/prisma/client.js';
import { toCalendarDate } from '../../core/index.js';
import type { ProjectContract } from '../../contract/index.js';
import { statusOf } from './project-records.js';
import { personRef } from './project-support.js';

// Cómo se muestra cada registro de Proyectos (B26), tal como lo define packages/contracts.

/** Lo que la vista necesita además del proyecto: nombres, cliente, contrato y avance. */
export interface ProjectContext {
  readonly names: ReadonlyMap<string, string>;
  readonly partyName: string;
  readonly contract: ProjectContract | null;
  readonly progress: ProjectProgress;
}

export function summaryView(project: PrjProject, context: ProjectContext): ProjectSummary {
  const { contract } = context;
  return {
    id: project.id,
    code: project.code,
    name: project.name,
    party: { id: project.partyId, name: context.partyName },
    contract:
      contract === null ? null : { id: contract.id, code: contract.code, title: contract.title },
    status: statusOf(project),
    starts_on: toCalendarDate(project.startsOn),
    ends_on: toCalendarDate(project.endsOn),
    manager: personRef(context.names, project.managerId),
    progress: context.progress,
    version: project.version,
  };
}

export function memberView(member: PrjMember, names: ReadonlyMap<string, string>): ProjectMember {
  return {
    id: member.id,
    person: personRef(names, member.userId) ?? { id: member.userId, name: 'Colaborador' },
    role: memberRoleSchema.parse(member.role),
    allocation_pct: member.allocationPct,
    version: member.version,
  };
}

export function milestoneView(milestone: PrjMilestone): ProjectMilestone {
  return {
    id: milestone.id,
    name: milestone.name,
    due_on: toCalendarDate(milestone.dueOn),
    billing_pct: milestone.billingPct.toNumber(),
    status: milestoneStatusSchema.parse(milestone.status),
    version: milestone.version,
  };
}

export function sprintView(sprint: PrjSprint, items: number): ProjectSprint {
  return {
    id: sprint.id,
    name: sprint.name,
    starts_on: toCalendarDate(sprint.startsOn),
    ends_on: toCalendarDate(sprint.endsOn),
    goal: sprint.goal,
    status: sprintStatusSchema.parse(sprint.status),
    items,
    version: sprint.version,
  };
}

export function linkView(link: PrjExternalLink): ProjectLink {
  return { id: link.id, kind: linkKindSchema.parse(link.kind), url: link.url, label: link.label };
}

/** Lo que muestra la ficha además del resumen. */
export interface ProjectParts {
  readonly members: readonly PrjMember[];
  readonly milestones: readonly PrjMilestone[];
  readonly sprints: readonly { readonly sprint: PrjSprint; readonly items: number }[];
  readonly links: readonly PrjExternalLink[];
  readonly can: ProjectDetail['can'];
}

export function detailView(
  project: PrjProject,
  context: ProjectContext,
  parts: ProjectParts,
): ProjectDetail {
  const { names } = context;
  return {
    ...summaryView(project, context),
    type: projectTypeSchema.parse(project.type),
    methodology: projectMethodologySchema.parse(project.methodology),
    description: project.description,
    budget_hours: project.budgetHours.toNumber(),
    budget_amount: project.budgetAmount === null ? null : project.budgetAmount.toFixed(2),
    status_reason: project.statusReason,
    contract_status: context.contract?.status ?? null,
    authorization: {
      status: authorizationStatusSchema.parse(project.authorizationStatus),
      reason: project.authorizationReason,
      note: project.authorizationNote,
      decided_by: personRef(names, project.authorizationDecidedBy),
      decided_at: project.authorizationDecidedAt?.toISOString() ?? null,
    },
    started_at: project.startedAt?.toISOString() ?? null,
    created_at: project.createdAt.toISOString(),
    members: parts.members.map((member) => memberView(member, names)),
    milestones: parts.milestones.map(milestoneView),
    sprints: parts.sprints.map(({ sprint, items }) => sprintView(sprint, items)),
    links: parts.links.map(linkView),
    can: parts.can,
  };
}

export type ItemWithParent = PrjItem & {
  readonly parent: Pick<PrjItem, 'id' | 'number' | 'title'> | null;
};

export function itemView(item: ItemWithParent, names: ReadonlyMap<string, string>): ProjectItem {
  return {
    id: item.id,
    number: item.number,
    code: item.code,
    type: itemTypeSchema.parse(item.type),
    parent:
      item.parent === null
        ? null
        : { id: item.parent.id, number: item.parent.number, title: item.parent.title },
    title: item.title,
    description: item.description,
    acceptance_criteria: item.acceptanceCriteria,
    status: itemStatusSchema.parse(item.status),
    priority: itemPrioritySchema.parse(item.priority),
    estimate_hours: item.estimateHours === null ? null : item.estimateHours.toNumber(),
    assignee: personRef(names, item.assigneeId),
    sprint_id: item.sprintId,
    review_url: item.reviewUrl,
    test_note: item.testNote,
    done_at: item.doneAt?.toISOString() ?? null,
    version: item.version,
  };
}

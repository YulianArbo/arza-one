import {
  approvalConfigSchema,
  conditionSchema,
  definitionStatusSchema,
  isPermissionCode,
  participantSchema,
  stateKindSchema,
  taskPrioritySchema,
  type DefinitionStatus,
  type StateInput,
  type TransitionInput,
} from '@arza/contracts';

import {
  Prisma,
  type WorkflowDefinition,
  type WorkflowState,
  type WorkflowTransition,
} from '../../../generated/prisma/client.js';
import type { TenantTransaction } from '../../../platform/database/tenant-context.js';
import type { Flow } from '../domain/engine.js';

// Lectura y escritura de las definiciones de flujo (wf_definitions, wf_states, wf_transitions).
// Las partes de un borrador se reemplazan por clave; las que salen quedan borradas lógicamente.

export interface StoredFlow extends Flow {
  readonly id: string;
  readonly key: string;
  readonly name: string;
  readonly description: string | null;
  readonly entityType: string;
  readonly versionNumber: number;
  readonly status: DefinitionStatus;
  readonly publishedAt: Date | null;
  readonly updatedAt: Date;
  readonly rowVersion: number;
}

const LIVE = { deletedAt: null } as const;
const WITH_PARTS = {
  states: { where: LIVE, orderBy: { position: 'asc' } },
  transitions: { where: LIVE, orderBy: { position: 'asc' } },
} as const satisfies Prisma.WorkflowDefinitionInclude;

function stateFrom(row: WorkflowState): StateInput {
  return {
    key: row.key,
    label: row.label,
    kind: stateKindSchema.parse(row.kind),
    sla_hours: row.slaHours,
    priority: taskPrioritySchema.parse(row.priority),
    assignee: row.assignee === null ? null : participantSchema.parse(row.assignee),
    approval: row.approval === null ? null : approvalConfigSchema.parse(row.approval),
  };
}

function transitionFrom(row: WorkflowTransition): TransitionInput {
  const permission = row.requiredPermission;
  return {
    from_state: row.fromState,
    to_state: row.toState,
    action: row.action,
    label: row.label,
    required_permission: permission !== null && isPermissionCode(permission) ? permission : null,
    condition: row.condition === null ? null : conditionSchema.parse(row.condition),
    requires_comment: row.requiresComment,
  };
}

type DefinitionWithParts = WorkflowDefinition & {
  states: WorkflowState[];
  transitions: WorkflowTransition[];
};

function flowFrom(row: DefinitionWithParts): StoredFlow {
  return {
    id: row.id,
    key: row.key,
    name: row.name,
    description: row.description,
    entityType: row.entityType,
    versionNumber: row.versionNumber,
    status: definitionStatusSchema.parse(row.status),
    publishedAt: row.publishedAt,
    updatedAt: row.updatedAt,
    rowVersion: row.version,
    states: row.states.map(stateFrom),
    transitions: row.transitions.map(transitionFrom),
  };
}

export async function findFlow(tx: TenantTransaction, id: string): Promise<StoredFlow | null> {
  const row = await tx.workflowDefinition.findFirst({
    where: { id, ...LIVE },
    include: WITH_PARTS,
  });
  return row === null ? null : flowFrom(row);
}

/** La versión publicada (vigente) del flujo con esa clave. */
export async function publishedFlow(
  tx: TenantTransaction,
  key: string,
): Promise<StoredFlow | null> {
  const row = await tx.workflowDefinition.findFirst({
    where: { key, status: 'published', ...LIVE },
    include: WITH_PARTS,
  });
  return row === null ? null : flowFrom(row);
}

/** Bloquea las versiones del flujo para publicar o versionar sin carreras. */
export async function lockFlowVersions(tx: TenantTransaction, key: string): Promise<void> {
  await tx.$queryRaw`SELECT id FROM wf_definitions WHERE key = ${key} FOR UPDATE`;
}

function json(value: object | null): Prisma.InputJsonValue | typeof Prisma.DbNull {
  return value === null ? Prisma.DbNull : { ...value };
}

function jsonList(value: readonly object[] | null): Prisma.InputJsonValue | typeof Prisma.DbNull {
  return value === null ? Prisma.DbNull : value.map((item) => ({ ...item }));
}

export interface FlowParts {
  readonly states: readonly StateInput[];
  readonly transitions: readonly TransitionInput[];
}

async function writeStates(
  tx: TenantTransaction,
  { now, ...owner }: Owner,
  states: readonly StateInput[],
) {
  for (const [position, state] of states.entries()) {
    const data = {
      position,
      label: state.label,
      kind: state.kind,
      slaHours: state.sla_hours,
      priority: state.priority,
      assignee: json(state.assignee),
      approval: json(state.approval),
      deletedAt: null,
    };
    await tx.workflowState.upsert({
      where: { definitionId_key: { definitionId: owner.definitionId, key: state.key } },
      create: { ...owner, key: state.key, ...data },
      update: data,
    });
  }
  await tx.workflowState.updateMany({
    where: { definitionId: owner.definitionId, key: { notIn: states.map((s) => s.key) }, ...LIVE },
    data: { deletedAt: now },
  });
}

interface Owner {
  readonly tenantId: string;
  readonly definitionId: string;
  readonly now: Date;
}

async function writeTransitions(
  tx: TenantTransaction,
  { now, ...owner }: Owner,
  transitions: readonly TransitionInput[],
) {
  for (const [position, t] of transitions.entries()) {
    const key = { definitionId: owner.definitionId, fromState: t.from_state, action: t.action };
    const data = {
      position,
      toState: t.to_state,
      label: t.label,
      requiredPermission: t.required_permission,
      condition: jsonList(t.condition),
      requiresComment: t.requires_comment,
      deletedAt: null,
    };
    await tx.workflowTransition.upsert({
      where: { definitionId_fromState_action: key },
      create: { ...owner, fromState: t.from_state, action: t.action, ...data },
      update: data,
    });
  }
  const kept = transitions.map((t) => `${t.from_state} ${t.action}`);
  const live = await tx.workflowTransition.findMany({
    where: { definitionId: owner.definitionId, ...LIVE },
    select: { id: true, fromState: true, action: true },
  });
  const gone = live.filter((row) => !kept.includes(`${row.fromState} ${row.action}`));
  await tx.workflowTransition.updateMany({
    where: { id: { in: gone.map((row) => row.id) } },
    data: { deletedAt: now },
  });
}

/** Deja las partes de un borrador como las mandó el editor. */
export async function writeFlowParts(
  tx: TenantTransaction,
  owner: Owner,
  parts: FlowParts,
): Promise<void> {
  await writeStates(tx, owner, parts.states);
  await writeTransitions(tx, owner, parts.transitions);
}

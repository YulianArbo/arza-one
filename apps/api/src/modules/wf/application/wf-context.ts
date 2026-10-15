import type { PermissionCode } from '@arza/contracts';

import { hasUnconditionalPermission, type AppAbility } from '../../../platform/access/ability.js';
import type { Principal } from '../../../platform/access/principal.js';
import type { Prisma } from '../../../generated/prisma/client.js';
import { recordAuditEvent } from '../../../platform/audit/audit-recorder.js';
import type { TenantTransaction } from '../../../platform/database/tenant-context.js';
import type { RequestMeta } from '../../../platform/http/request-meta.js';
import { superiorPositionId } from '../../core/index.js';
import {
  activeRoleCodes,
  activeUsersInPosition,
  delegationsTo,
  positionOfUser,
  type ReceivedDelegation,
} from '../../iam/index.js';
import type { TaskActor } from '../domain/task-rules.js';

// Quién actúa en el motor y cómo queda en la auditoría (ADR-012): una persona con sesión, o el
// sistema cuando el worker escala tareas vencidas.

export interface WfContext {
  readonly tenantId: string;
  /** null cuando actúa el sistema. */
  readonly userId: string | null;
  readonly meta: RequestMeta | null;
  readonly at: Date;
}

export function contextOf(principal: Principal, meta: RequestMeta, at: Date): WfContext {
  return { tenantId: principal.tenantId, userId: principal.userId, meta, at };
}

export interface WfChange {
  readonly action: string;
  readonly entityType: 'wf_definition' | 'wf_instance' | 'wf_task';
  readonly entityId: string;
  readonly changes: Prisma.InputJsonObject;
}

export async function auditWf(
  tx: TenantTransaction,
  context: WfContext,
  change: WfChange,
): Promise<void> {
  await recordAuditEvent(tx, {
    tenantId: context.tenantId,
    occurredAt: context.at,
    actor: context.userId === null ? { kind: 'system' } : { kind: 'user', id: context.userId },
    action: change.action,
    entityType: change.entityType,
    entityId: change.entityId,
    result: 'success',
    changes: change.changes,
    meta: context.meta,
  });
}

/** Jefe inmediato: quien ocupa el cargo al que reporta el cargo de la persona. */
export async function supervisorOf(
  tx: TenantTransaction,
  userId: string | null,
): Promise<string | null> {
  if (userId === null) return null;
  const position = await positionOfUser(tx, userId);
  const superior = position === null ? null : await superiorPositionId(tx, position);
  if (superior === null) return null;
  const [first] = await activeUsersInPosition(tx, superior);
  return first ?? null;
}

/** Roles, delegaciones recibidas y permiso de reasignar de quien pide atender tareas. */
export async function taskActorOf(
  tx: TenantTransaction,
  principal: Principal,
  ability: AppAbility,
  now: Date,
): Promise<TaskActor> {
  const [roles, delegations] = await Promise.all([
    activeRoleCodes(tx, principal.userId, now),
    delegationsTo(tx, principal.userId, now),
  ]);
  return {
    userId: principal.userId,
    roleCodes: new Set(roles),
    delegations: byDelegator(delegations),
    canReassign: hasUnconditionalPermission(ability, 'wf.task.reassign'),
  };
}

/** Una persona puede haber delegado varias veces: se suman sus permisos. */
function byDelegator(delegations: readonly ReceivedDelegation[]) {
  const result = new Map<string, Set<PermissionCode>>();
  for (const delegation of delegations) {
    const permissions = result.get(delegation.fromUserId) ?? new Set<PermissionCode>();
    for (const permission of delegation.permissions) permissions.add(permission);
    result.set(delegation.fromUserId, permissions);
  }
  return result;
}

import { itemStatusSchema, itemTypeSchema, type ItemStatus, type ItemType } from '@arza/contracts';

import type { PrjItem, Prisma } from '../../../generated/prisma/client.js';
import type { TenantTransaction } from '../../../platform/database/tenant-context.js';
import { versionConflict } from '../../../platform/http/if-match.js';
import { parentAllowed } from '../domain/project-rules.js';
import { memberInvalid, parentInvalid, projectNotFound } from './project-messages.js';
import type { ProjectPartTarget } from './project-support.js';

// Lectura y escritura de los ítems con su versión (B26), comunes a los casos de uso.

export async function findItem(
  tx: TenantTransaction,
  target: { readonly id: string; readonly projectId: string },
): Promise<PrjItem> {
  const item = await tx.prjItem.findFirst({
    where: { id: target.id, projectId: target.projectId, deletedAt: null },
  });
  if (item === null) throw projectNotFound('El ítem');
  return item;
}

export function typeOf(item: Pick<PrjItem, 'type'>): ItemType {
  return itemTypeSchema.parse(item.type);
}

export function statusOfItem(item: Pick<PrjItem, 'status'>): ItemStatus {
  return itemStatusSchema.parse(item.status);
}

/** La épica o historia de la que cuelga el ítem es del mismo proyecto y del tipo que corresponde. */
export async function assertParent(
  tx: TenantTransaction,
  projectId: string,
  type: ItemType,
  parentId: string | null,
): Promise<void> {
  if (parentId === null) return;
  const parent = await tx.prjItem.findFirst({
    where: { id: parentId, projectId, deletedAt: null },
  });
  if (parent === null || !parentAllowed(type, typeOf(parent))) throw parentInvalid();
}

/** Quien tiene el ítem a cargo es miembro activo del equipo. */
export function assertAssignee(memberIds: readonly string[], assigneeId: string | null): void {
  if (assigneeId !== null && !memberIds.includes(assigneeId)) {
    throw memberInvalid('Asigne el ítem a una persona del equipo del proyecto.');
  }
}

/** El siguiente número del ítem dentro de su proyecto (con el proyecto bloqueado). */
export async function nextItemNumber(tx: TenantTransaction, projectId: string): Promise<number> {
  const last = await tx.prjItem.aggregate({ where: { projectId }, _max: { number: true } });
  return (last._max.number ?? 0) + 1;
}

export async function updateItemVersioned(
  tx: TenantTransaction,
  target: ProjectPartTarget,
  data: Parameters<TenantTransaction['prjItem']['updateMany']>[0]['data'],
): Promise<void> {
  const { count } = await tx.prjItem.updateMany({
    where: { id: target.id, projectId: target.projectId, version: target.version, deletedAt: null },
    data,
  });
  if (count === 0) throw versionConflict();
}

/** Lo que guarda la auditoría del ítem. */
export function itemAudit(item: PrjItem): Record<string, string | null> {
  return {
    code: item.code,
    type: item.type,
    title: item.title,
    status: item.status,
    priority: item.priority,
    parent_id: item.parentId,
    assignee_id: item.assigneeId,
    sprint_id: item.sprintId,
    has_criteria: item.acceptanceCriteria === null ? 'no' : 'yes',
    estimate_hours: item.estimateHours === null ? null : item.estimateHours.toFixed(1),
  };
}

export function itemPayload(item: PrjItem): Prisma.InputJsonObject {
  return {
    project_id: item.projectId,
    code: item.code,
    status: item.status,
    assignee_id: item.assigneeId,
  };
}

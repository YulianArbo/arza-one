import type { PersonRef } from '@arza/contracts';

import type { Prisma } from '../../../generated/prisma/client.js';
import type { Principal } from '../../../platform/access/principal.js';
import { recordAuditEvent } from '../../../platform/audit/audit-recorder.js';
import type { TenantTransaction } from '../../../platform/database/tenant-context.js';
import type { RequestMeta } from '../../../platform/http/request-meta.js';
import { addOutboxEvent } from '../../../platform/outbox/outbox.js';
import { peopleById } from '../../iam/index.js';

// Piezas comunes de los casos de uso de Proyectos (B26): quién actúa, la auditoría y la bandeja de
// salida de cada escritura (ADR-012), y los nombres de las personas.

/** Quién actúa: una persona con sesión o el sistema. */
export interface ProjectActor {
  readonly tenantId: string;
  readonly userId: string | null;
  readonly meta: RequestMeta | null;
  readonly at: Date;
}

export function projectActorOf(principal: Principal, meta: RequestMeta, at: Date): ProjectActor {
  return { tenantId: principal.tenantId, userId: principal.userId, meta, at };
}

/** El registro que se cambia y la versión que se vio (If-Match). */
export interface ProjectTarget {
  readonly id: string;
  readonly version: number;
}

/** Un registro de un proyecto (miembro, hito, iteración, ítem o enlace) y la versión que se vio. */
export interface ProjectPartTarget extends ProjectTarget {
  readonly projectId: string;
}

type ProjectEntity =
  'prj_project' | 'prj_member' | 'prj_milestone' | 'prj_sprint' | 'prj_item' | 'prj_external_link';

export interface ProjectChange {
  /** Acción de la auditoría, como «project.member.add». */
  readonly action: string;
  /** Evento de dominio de la bandeja de salida, como «project.member.added». */
  readonly event: string;
  readonly entityType: ProjectEntity;
  readonly entityId: string;
  readonly changes: Prisma.InputJsonObject;
  /** Datos mínimos del evento: identificadores y códigos, nunca datos personales. */
  readonly payload: Prisma.InputJsonObject;
}

/** Evento de auditoría y evento de la bandeja de salida, en la misma transacción. */
export async function recordProjectChange(
  tx: TenantTransaction,
  actor: ProjectActor,
  change: ProjectChange,
): Promise<void> {
  await recordAuditEvent(tx, {
    tenantId: actor.tenantId,
    occurredAt: actor.at,
    actor: actor.userId === null ? { kind: 'system' } : { kind: 'user', id: actor.userId },
    action: change.action,
    entityType: change.entityType,
    entityId: change.entityId,
    result: 'success',
    changes: change.changes,
    meta: actor.meta,
  });
  await addOutboxEvent(tx, {
    tenantId: actor.tenantId,
    eventType: change.event,
    actorId: actor.userId,
    occurredAt: actor.at,
    payload: { id: change.entityId, ...change.payload },
  });
}

/** Nombre de cada persona de la empresa, para mostrar el equipo y los responsables. */
export async function peopleNames(
  tx: TenantTransaction,
  ids: readonly (string | null)[],
): Promise<Map<string, string>> {
  const present = ids.filter((id): id is string => id !== null);
  const people = await peopleById(tx, present);
  return new Map([...people].map(([id, person]) => [id, person.displayName ?? person.email]));
}

export function personRef(names: ReadonlyMap<string, string>, id: string | null): PersonRef | null {
  if (id === null) return null;
  return { id, name: names.get(id) ?? 'Colaborador' };
}

import type { PersonRef } from '@arza/contracts';

import type { Prisma } from '../../../generated/prisma/client.js';
import type { AppAbility } from '../../../platform/access/ability.js';
import type { Principal } from '../../../platform/access/principal.js';
import { recordAuditEvent } from '../../../platform/audit/audit-recorder.js';
import type { TenantTransaction } from '../../../platform/database/tenant-context.js';
import type { RequestMeta } from '../../../platform/http/request-meta.js';
import { addOutboxEvent } from '../../../platform/outbox/outbox.js';
import { isActiveInternalUser, peopleById } from '../../iam/index.js';
import { responsibleInvalid } from './contract-messages.js';

// Piezas comunes de los casos de uso de Contratos (B24): quién actúa, la auditoría y la bandeja de
// salida de cada escritura (ADR-012), y los nombres de las personas.

/** Quién actúa: una persona con sesión o el sistema (el worker). */
export interface ContractActor {
  readonly tenantId: string;
  readonly userId: string | null;
  readonly meta: RequestMeta | null;
  readonly at: Date;
}

/** Quien pide el paso: su sesión y sus permisos, para atender la tarea de la Dirección. */
export interface ContractRequester {
  readonly principal: Principal;
  readonly ability: AppAbility;
  readonly meta: RequestMeta;
}

export function contractActorOf(principal: Principal, meta: RequestMeta, at: Date): ContractActor {
  return { tenantId: principal.tenantId, userId: principal.userId, meta, at };
}

export function systemActor(tenantId: string, at: Date): ContractActor {
  return { tenantId, userId: null, meta: null, at };
}

/** El registro que se cambia y la versión que se vio (If-Match). */
export interface ContractTarget {
  readonly id: string;
  readonly version: number;
}

type ContractEntity =
  | 'ctr_contract'
  | 'ctr_obligation'
  | 'ctr_amendment'
  | 'ctr_clause'
  | 'ctr_clause_library'
  | 'ctr_template'
  | 'sig_envelope';

export interface ContractChange {
  /** Acción de la auditoría, como «contract.approve». */
  readonly action: string;
  /** Evento de dominio de la bandeja de salida (numeral 13.3), como «contract.approved». */
  readonly event: string;
  readonly entityType: ContractEntity;
  readonly entityId: string;
  readonly changes: Prisma.InputJsonObject;
  /** Datos mínimos del evento: identificadores y códigos, nunca datos personales. */
  readonly payload?: Prisma.InputJsonObject;
}

/** Evento de auditoría y evento de la bandeja de salida, en la misma transacción. */
export async function recordContractChange(
  tx: TenantTransaction,
  actor: ContractActor,
  change: ContractChange,
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

/** El colaborador pedido, o quien actúa; debe estar activo en la empresa. */
export async function responsibleFor(
  tx: TenantTransaction,
  actor: ContractActor,
  requested: string | null,
): Promise<string | null> {
  const responsible = requested ?? actor.userId;
  if (responsible !== null && !(await isActiveInternalUser(tx, responsible))) {
    throw responsibleInvalid();
  }
  return responsible;
}

/** Nombre de cada persona de la empresa, para mostrar responsables y autores. */
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

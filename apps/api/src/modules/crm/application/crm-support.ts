import type { PersonRef } from '@arza/contracts';

import type { Prisma } from '../../../generated/prisma/client.js';
import type { Principal } from '../../../platform/access/principal.js';
import { recordAuditEvent } from '../../../platform/audit/audit-recorder.js';
import type { TenantTransaction } from '../../../platform/database/tenant-context.js';
import type { RequestMeta } from '../../../platform/http/request-meta.js';
import { addOutboxEvent } from '../../../platform/outbox/outbox.js';
import { isActiveCatalogCode } from '../../core/index.js';
import { isActiveInternalUser, peopleById } from '../../iam/index.js';
import { campaignInvalid, catalogValueInvalid, ownerInvalid } from './crm-messages.js';

// Piezas comunes de los casos de uso del CRM (B22): quién actúa, la auditoría y la bandeja de
// salida de cada escritura (ADR-012), y las validaciones que comparten prospectos y oportunidades.

/** Quién actúa: una persona con sesión o el sistema (el worker, el sitio público en B41). */
export interface CrmActor {
  readonly tenantId: string;
  readonly userId: string | null;
  readonly meta: RequestMeta | null;
  readonly at: Date;
}

export function crmActorOf(principal: Principal, meta: RequestMeta, at: Date): CrmActor {
  return { tenantId: principal.tenantId, userId: principal.userId, meta, at };
}

/** El registro que se cambia y la versión que se vio (If-Match). */
export interface CrmTarget {
  readonly id: string;
  readonly version: number;
}

export type CrmEntity = 'crm_lead' | 'crm_opportunity' | 'crm_activity' | 'crm_campaign';

export interface CrmChange {
  /** Acción de la auditoría, como «crm.opportunity.win». */
  readonly action: string;
  /** Evento de dominio de la bandeja de salida (numeral 13.3), como «crm.opportunity.won». */
  readonly event: string;
  readonly entityType: CrmEntity;
  readonly entityId: string;
  readonly changes: Prisma.InputJsonObject;
  /** Datos mínimos del evento: identificadores y códigos, nunca datos personales. */
  readonly payload?: Prisma.InputJsonObject;
}

/** Evento de auditoría y evento de la bandeja de salida, en la misma transacción. */
export async function recordCrmChange(
  tx: TenantTransaction,
  actor: CrmActor,
  change: CrmChange,
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

/** El responsable pedido, o quien actúa; debe ser un colaborador activo. */
export async function ownerFor(
  tx: TenantTransaction,
  actor: CrmActor,
  requested: string | null,
): Promise<string | null> {
  const owner = requested ?? actor.userId;
  if (owner !== null && !(await isActiveInternalUser(tx, owner))) throw ownerInvalid();
  return owner;
}

/** La opción sigue activa en su catálogo. */
export async function assertCatalogCode(
  tx: TenantTransaction,
  catalog: string,
  code: string,
  what: string,
): Promise<void> {
  if (!(await isActiveCatalogCode(tx, catalog, code))) throw catalogValueInvalid(what);
}

export async function assertCampaign(tx: TenantTransaction, id: string | null): Promise<void> {
  if (id === null) return;
  const found = await tx.crmCampaign.count({ where: { id, deletedAt: null } });
  if (found === 0) throw campaignInvalid();
}

/** Nombre de cada persona de la empresa, para mostrar responsables. */
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

import { HttpStatus } from '@nestjs/common';
import { SERVICE_ERROR_CODES, type PersonRef } from '@arza/contracts';

import type { Prisma } from '../../../generated/prisma/client.js';
import type { Principal } from '../../../platform/access/principal.js';
import { recordAuditEvent } from '../../../platform/audit/audit-recorder.js';
import type { TenantTransaction } from '../../../platform/database/tenant-context.js';
import { AppError } from '../../../platform/errors/app-error.js';
import type { RequestMeta } from '../../../platform/http/request-meta.js';
import { addOutboxEvent } from '../../../platform/outbox/outbox.js';
import { peopleById } from '../../iam/index.js';

// Piezas comunes de Servicio al cliente (B28 y B29): quién actúa, la auditoría y la bandeja de salida de cada
// escritura en la misma transacción (ADR-012), los mensajes de error y los nombres de las personas.

/** Quién actúa: una persona con sesión o el sistema (el reloj del worker). */
export interface ServiceActor {
  readonly tenantId: string;
  readonly userId: string | null;
  readonly meta: RequestMeta | null;
  readonly at: Date;
}

export function serviceActorOf(principal: Principal, meta: RequestMeta, at: Date): ServiceActor {
  return { tenantId: principal.tenantId, userId: principal.userId, meta, at };
}

/** El registro que se cambia y la versión que se vio (If-Match). */
export interface ServiceTarget {
  readonly id: string;
  readonly version: number;
}

type ServiceEntity =
  | 'wf_sla_policy'
  | 'svc_ticket'
  | 'svc_ticket_message'
  | 'svc_warranty'
  | 'svc_compensation'
  | 'svc_pqrsf'
  | 'svc_survey'
  | 'svc_survey_response'
  | 'svc_kb_article';

export interface ServiceChange {
  /** Acción de la auditoría, como «service.ticket.assign». */
  readonly action: string;
  /** Evento de la bandeja de salida, como «service.ticket.assigned». */
  readonly event: string;
  readonly entityType: ServiceEntity;
  readonly entityId: string;
  readonly changes: Prisma.InputJsonObject;
  /** Datos mínimos del evento: identificadores y códigos, nunca datos personales. */
  readonly payload: Prisma.InputJsonObject;
}

export async function recordServiceChange(
  tx: TenantTransaction,
  actor: ServiceActor,
  change: ServiceChange,
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

/** Nombre de cada persona de la empresa. */
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

// Mensajes de error: claros, en español y con trato de usted --------------------------------------

export function serviceNotFound(what: string): AppError {
  return new AppError(HttpStatus.NOT_FOUND, SERVICE_ERROR_CODES.notFound, `${what} no existe.`);
}

/** «No existe» con un mensaje completo, como el de un enlace público que ya no sirve. */
export function serviceMissing(detail: string): AppError {
  return new AppError(HttpStatus.NOT_FOUND, SERVICE_ERROR_CODES.notFound, detail);
}

export function statusInvalid(detail: string): AppError {
  return new AppError(HttpStatus.CONFLICT, SERVICE_ERROR_CODES.statusInvalid, detail);
}

export function assigneeInvalid(): AppError {
  return new AppError(
    HttpStatus.UNPROCESSABLE_ENTITY,
    SERVICE_ERROR_CODES.assigneeInvalid,
    'Elija una persona activa de Servicio al cliente o un Líder técnico.',
  );
}

export function linkInvalid(detail: string): AppError {
  return new AppError(HttpStatus.UNPROCESSABLE_ENTITY, SERVICE_ERROR_CODES.linkInvalid, detail);
}

export function levelInvalid(): AppError {
  return new AppError(
    HttpStatus.CONFLICT,
    SERVICE_ERROR_CODES.levelInvalid,
    'El tiquete ya está en el nivel 3. Reasígnelo en lugar de escalarlo.',
  );
}

export function compensationInvalid(detail: string): AppError {
  return new AppError(
    HttpStatus.UNPROCESSABLE_ENTITY,
    SERVICE_ERROR_CODES.compensationInvalid,
    detail,
  );
}

export function datesInvalid(detail: string): AppError {
  return new AppError(HttpStatus.UNPROCESSABLE_ENTITY, SERVICE_ERROR_CODES.datesInvalid, detail);
}

export function approverInvalid(): AppError {
  return new AppError(
    HttpStatus.UNPROCESSABLE_ENTITY,
    SERVICE_ERROR_CODES.approverInvalid,
    'Quien redactó la respuesta no puede aprobarla. Pídale a otra persona que la apruebe.',
  );
}

export function responseInvalid(detail: string): AppError {
  return new AppError(HttpStatus.UNPROCESSABLE_ENTITY, SERVICE_ERROR_CODES.responseInvalid, detail);
}

export function publicUnavailable(): AppError {
  return new AppError(
    HttpStatus.SERVICE_UNAVAILABLE,
    SERVICE_ERROR_CODES.publicUnavailable,
    'El formulario no está disponible en este momento. Escríbanos al correo de atención al cliente.',
  );
}

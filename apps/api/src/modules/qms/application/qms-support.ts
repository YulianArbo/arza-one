import { HttpStatus } from '@nestjs/common';
import { QMS_ERROR_CODES, type QmsRef } from '@arza/contracts';

import type { Prisma } from '../../../generated/prisma/client.js';
import type { Principal } from '../../../platform/access/principal.js';
import { recordAuditEvent } from '../../../platform/audit/audit-recorder.js';
import type { TenantTransaction } from '../../../platform/database/tenant-context.js';
import { AppError } from '../../../platform/errors/app-error.js';
import type { RequestMeta } from '../../../platform/http/request-meta.js';
import { addOutboxEvent } from '../../../platform/outbox/outbox.js';
import { activeProcesses, orgUnitsById, toCalendarDate } from '../../core/index.js';
import { isAttachableFile } from '../../doc/index.js';
import { activeUsersWithRoles, isActiveInternalUser, peopleById } from '../../iam/index.js';

// Ayudas que comparten los casos de uso de Calidad (B38): quién actúa, los errores, la auditoría
// y los eventos dentro de la transacción, los nombres para mostrar y quién recibe los avisos.

/** Quien actúa: la persona (o el sistema), la hora del caso de uso y los datos de la petición. */
export interface QmsActor {
  readonly tenantId: string;
  readonly userId: string;
  readonly at: Date;
  readonly meta: RequestMeta | null;
}

export interface Target {
  readonly id: string;
  readonly version: number;
}

export function qmsActorOf(principal: Principal, at: Date, meta: RequestMeta | null): QmsActor {
  return { tenantId: principal.tenantId, userId: principal.userId, at, meta };
}

export function qmsNotFound(message: string): AppError {
  return new AppError(HttpStatus.NOT_FOUND, QMS_ERROR_CODES.recordNotFound, message);
}

export function qmsInvalid(message: string): AppError {
  return new AppError(HttpStatus.UNPROCESSABLE_ENTITY, QMS_ERROR_CODES.recordInvalid, message);
}

export function qmsConflict(message: string): AppError {
  return new AppError(HttpStatus.CONFLICT, QMS_ERROR_CODES.statusInvalid, message);
}

/** Decisión 8: la eficacia la verifica alguien distinto de quien responde o ejecutó. */
export function selfVerification(): AppError {
  return new AppError(
    HttpStatus.FORBIDDEN,
    QMS_ERROR_CODES.selfVerification,
    'La eficacia la verifica una persona distinta del responsable y de quien ejecutó la acción.',
  );
}

/** Auditoría de Calidad en la misma transacción del cambio. */
export async function auditQms(
  tx: TenantTransaction,
  actor: QmsActor,
  event: {
    readonly action: string;
    readonly entityType: string;
    readonly entityId: string;
    readonly changes: Prisma.InputJsonObject;
  },
): Promise<void> {
  await recordAuditEvent(tx, {
    tenantId: actor.tenantId,
    occurredAt: actor.at,
    actor: { kind: 'user', id: actor.userId },
    action: event.action,
    entityType: event.entityType,
    entityId: event.entityId,
    result: 'success',
    changes: event.changes,
    meta: actor.meta,
  });
}

/** Evento de Calidad en la bandeja de salida: solo identificadores, códigos y destinatarios. */
export async function emitQms(
  tx: TenantTransaction,
  actor: { readonly tenantId: string; readonly userId: string | null; readonly at: Date },
  eventType: string,
  payload: Prisma.InputJsonObject,
): Promise<void> {
  await addOutboxEvent(tx, {
    tenantId: actor.tenantId,
    actorId: actor.userId,
    occurredAt: actor.at,
    eventType,
    payload,
  });
}

/** Las cuentas activas con el rol de Calidad: reciben las no conformidades y verifican. */
export async function qualityLeaders(tx: TenantTransaction, at: Date): Promise<string[]> {
  return activeUsersWithRoles(tx, ['CALIDAD'], at);
}

/** Calidad y la Dirección: reciben el escalamiento de las acciones vencidas (decisión 11). */
export async function escalationRecipients(tx: TenantTransaction, at: Date): Promise<string[]> {
  return activeUsersWithRoles(tx, ['CALIDAD', 'DIRECCION'], at);
}

/** El proceso es uno de los procesos activos del núcleo. */
export async function assertProcess(
  tx: TenantTransaction,
  processId: string | null,
): Promise<void> {
  if (processId === null) return;
  const processes = await activeProcesses(tx);
  if (processes.some((process) => process.id === processId)) return;
  throw qmsInvalid('El proceso no existe o no está activo.');
}

/** La persona responsable tiene una cuenta activa de la empresa. */
export async function assertPerson(tx: TenantTransaction, userId: string): Promise<void> {
  if (await isActiveInternalUser(tx, userId)) return;
  throw qmsInvalid('La persona responsable no existe o no está activa.');
}

/** El archivo existe, está disponible y lo subió la persona. */
export async function assertFile(
  tx: TenantTransaction,
  principal: Principal,
  fileId: string | null,
): Promise<void> {
  if (fileId === null || (await isAttachableFile(tx, principal, fileId))) return;
  throw qmsInvalid('El archivo adjunto no está disponible.');
}

/** Nombre de cada cuenta, por su identificador. */
export async function userRefs(
  tx: TenantTransaction,
  ids: readonly (string | null)[],
): Promise<Map<string, QmsRef>> {
  const present = ids.filter((id): id is string => id !== null);
  const people = await peopleById(tx, [...new Set(present)]);
  return new Map(
    [...people.values()].map((person) => [
      person.id,
      { id: person.id, name: person.displayName ?? person.email },
    ]),
  );
}

/** Nombre de cada proceso del núcleo, por su identificador. */
export async function processRefs(
  tx: TenantTransaction,
  ids: readonly (string | null)[],
): Promise<Map<string, QmsRef>> {
  const present = ids.filter((id): id is string => id !== null);
  const units = await orgUnitsById(tx, [...new Set(present)]);
  return new Map(
    [...units.values()].map((unit) => [
      unit.id,
      { id: unit.id, name: `${unit.code} · ${unit.name}` },
    ]),
  );
}

/** Referencia por identificador; si no está en el mapa, un nombre genérico. */
export function refOf(refs: ReadonlyMap<string, QmsRef>, id: string, fallback = 'Persona'): QmsRef {
  return refs.get(id) ?? { id, name: fallback };
}

export function optionalRef(
  refs: ReadonlyMap<string, QmsRef>,
  id: string | null,
  fallback: string,
): QmsRef | null {
  return id === null ? null : refOf(refs, id, fallback);
}

export function dateOf(value: Date | null): string | null {
  return value === null ? null : toCalendarDate(value);
}

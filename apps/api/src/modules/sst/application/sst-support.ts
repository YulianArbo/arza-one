import { HttpStatus } from '@nestjs/common';
import { SST_ERROR_CODES, type SstRef } from '@arza/contracts';

import type { Prisma } from '../../../generated/prisma/client.js';
import type { AppAbility } from '../../../platform/access/ability.js';
import type { Principal } from '../../../platform/access/principal.js';
import { recordAuditEvent } from '../../../platform/audit/audit-recorder.js';
import type { TenantTransaction } from '../../../platform/database/tenant-context.js';
import { AppError } from '../../../platform/errors/app-error.js';
import type { RequestMeta } from '../../../platform/http/request-meta.js';
import { addOutboxEvent } from '../../../platform/outbox/outbox.js';
import { toCalendarDate } from '../../core/index.js';
import { isAttachableFile } from '../../doc/index.js';
import { activeUsersWithRoles, peopleById } from '../../iam/index.js';

// Ayudas que comparten los casos de uso de Seguridad y salud en el trabajo (B37): quién actúa, los
// errores, la auditoría y los eventos dentro de la transacción, los nombres para mostrar y quién
// recibe los avisos de SST.

/** Quien actúa: la persona, la hora del caso de uso y los datos de la petición. */
export interface SstActor {
  readonly tenantId: string;
  readonly userId: string;
  readonly at: Date;
  readonly meta: RequestMeta;
}

/** Quien consulta, con sus permisos. */
export interface SstViewer {
  readonly principal: Principal;
  readonly ability: AppAbility;
}

export interface Target {
  readonly id: string;
  readonly version: number;
}

export function sstNotFound(message: string): AppError {
  return new AppError(HttpStatus.NOT_FOUND, SST_ERROR_CODES.recordNotFound, message);
}

export function sstInvalid(message: string): AppError {
  return new AppError(HttpStatus.UNPROCESSABLE_ENTITY, SST_ERROR_CODES.recordInvalid, message);
}

export function sstConflict(message: string): AppError {
  return new AppError(HttpStatus.CONFLICT, SST_ERROR_CODES.statusInvalid, message);
}

/** Lo del comité solo lo atienden sus integrantes vigentes (decisiones 8 y 9). */
export function notCommitteeMember(): AppError {
  return new AppError(
    HttpStatus.FORBIDDEN,
    SST_ERROR_CODES.notCommitteeMember,
    'Solo los integrantes vigentes del comité pueden ver y registrar su información.',
  );
}

/** Bloquea por clave para que un reintento o una petición simultánea no duplique el registro. */
export async function lockKey(tx: TenantTransaction, key: string): Promise<void> {
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${key}, 0))`;
}

/** Auditoría de SST en la misma transacción del cambio. */
export async function auditSst(
  tx: TenantTransaction,
  actor: SstActor,
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

/** Evento de SST en la bandeja de salida: solo identificadores y destinatarios. */
export async function emitSst(
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

/** Las cuentas activas con el rol SST: reciben los reportes y las alertas. */
export async function sstLeaders(tx: TenantTransaction, at: Date): Promise<string[]> {
  return activeUsersWithRoles(tx, ['SST'], at);
}

/** El archivo existe, está disponible y lo subió la persona. */
export async function assertFile(
  tx: TenantTransaction,
  principal: Principal,
  fileId: string | null,
): Promise<void> {
  if (fileId === null || (await isAttachableFile(tx, principal, fileId))) return;
  throw sstInvalid('El archivo adjunto no está disponible.');
}

/** Nombre de cada cuenta, por su identificador. */
export async function userRefs(
  tx: TenantTransaction,
  ids: readonly (string | null)[],
): Promise<Map<string, SstRef>> {
  const present = ids.filter((id): id is string => id !== null);
  const people = await peopleById(tx, [...new Set(present)]);
  return new Map(
    [...people.values()].map((person) => [
      person.id,
      { id: person.id, name: person.displayName ?? person.email },
    ]),
  );
}

/** Referencia a una cuenta o colaborador; si no está en el mapa, un nombre genérico. */
export function refOf(refs: ReadonlyMap<string, SstRef>, id: string, fallback = 'Persona'): SstRef {
  return refs.get(id) ?? { id, name: fallback };
}

export function dateOf(value: Date | null): string | null {
  return value === null ? null : toCalendarDate(value);
}

/** dd/mm/aaaa, como se muestran las fechas en Colombia. */
export function shown(date: string): string {
  const [year = '', month = '', day = ''] = date.split('-');
  return `${day}/${month}/${year}`;
}

/** Contexto del cifrado de un campo: liga el texto a su tabla, empresa, registro y columna. */
export function cipherContext(table: string, tenantId: string, id: string, field: string): string {
  return `${table}:${tenantId}:${id}:${field}`;
}

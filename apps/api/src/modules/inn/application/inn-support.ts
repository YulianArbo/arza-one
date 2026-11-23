import { HttpStatus } from '@nestjs/common';
import { INN_ERROR_CODES, type InnRef } from '@arza/contracts';

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
import { isActiveInternalUser, peopleById } from '../../iam/index.js';

// Ayudas que comparten los casos de uso de Innovación (B40): quién actúa, los errores, la
// auditoría y los eventos dentro de la transacción y los nombres para mostrar.

/** Quien actúa: la persona (o el sistema), la hora del caso de uso y los datos de la petición. */
export interface InnActor {
  readonly tenantId: string;
  readonly userId: string | null;
  readonly at: Date;
  readonly meta: RequestMeta | null;
}

/** Quien consulta o actúa, con sus permisos. */
export interface InnViewer {
  readonly principal: Principal;
  readonly ability: AppAbility;
}

export interface Target {
  readonly id: string;
  readonly version: number;
}

export function innActorOf(principal: Principal, at: Date, meta: RequestMeta | null): InnActor {
  return { tenantId: principal.tenantId, userId: principal.userId, at, meta };
}

export function innSystemActor(tenantId: string, at: Date): InnActor {
  return { tenantId, userId: null, at, meta: null };
}

export function innNotFound(message: string): AppError {
  return new AppError(HttpStatus.NOT_FOUND, INN_ERROR_CODES.recordNotFound, message);
}

export function innInvalid(message: string): AppError {
  return new AppError(HttpStatus.UNPROCESSABLE_ENTITY, INN_ERROR_CODES.recordInvalid, message);
}

export function innConflict(message: string): AppError {
  return new AppError(HttpStatus.CONFLICT, INN_ERROR_CODES.statusInvalid, message);
}

/** Decisión 3: quien propuso la idea no la evalúa ni decide sobre ella. */
export function selfDecision(): AppError {
  return new AppError(
    HttpStatus.FORBIDDEN,
    INN_ERROR_CODES.selfDecision,
    'Una idea la evalúa y la decide una persona distinta de quien la propuso.',
  );
}

/** Decisión 8: el software no se radica sin la cesión escrita de todos sus autores. */
export function chainIncomplete(): AppError {
  return new AppError(
    HttpStatus.UNPROCESSABLE_ENTITY,
    INN_ERROR_CODES.chainIncomplete,
    'Registre al menos un autor y el soporte de cesión de cada uno antes de radicar el software.',
  );
}

/** Auditoría y evento de Innovación en la misma transacción del cambio. */
export async function recordInnChange(
  tx: TenantTransaction,
  actor: InnActor,
  change: {
    readonly action: string;
    readonly event: string;
    readonly entityType: string;
    readonly entityId: string;
    readonly changes: Prisma.InputJsonObject;
  },
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
    actorId: actor.userId,
    occurredAt: actor.at,
    eventType: change.event,
    payload: { id: change.entityId },
  });
}

/** La persona tiene una cuenta activa de la empresa. */
export async function assertPerson(tx: TenantTransaction, userId: string): Promise<void> {
  if (await isActiveInternalUser(tx, userId)) return;
  throw innInvalid('La persona no existe o no está activa.');
}

/** El archivo existe, está disponible y lo subió la persona. */
export async function assertFile(
  tx: TenantTransaction,
  principal: Principal,
  fileId: string | null,
): Promise<void> {
  if (fileId === null || (await isAttachableFile(tx, principal, fileId))) return;
  throw innInvalid('El archivo adjunto no está disponible.');
}

/** Nombre de cada cuenta, por su identificador. */
export async function userRefs(
  tx: TenantTransaction,
  ids: readonly (string | null)[],
): Promise<Map<string, InnRef>> {
  const present = ids.filter((id): id is string => id !== null);
  const people = await peopleById(tx, [...new Set(present)]);
  return new Map(
    [...people.values()].map((person) => [
      person.id,
      { id: person.id, name: person.displayName ?? person.email },
    ]),
  );
}

/** Referencia por identificador; si no está en el mapa, un nombre genérico. */
export function refOf(refs: ReadonlyMap<string, InnRef>, id: string): InnRef {
  return refs.get(id) ?? { id, name: 'Persona' };
}

export function optionalRef(refs: ReadonlyMap<string, InnRef>, id: string | null): InnRef | null {
  return id === null ? null : refOf(refs, id);
}

export function dateOf(value: Date | null): string | null {
  return value === null ? null : toCalendarDate(value);
}

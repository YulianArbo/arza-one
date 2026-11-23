import { HttpStatus } from '@nestjs/common';
import { SITE_ERROR_CODES, type SiteRef } from '@arza/contracts';

import type { Prisma } from '../../../generated/prisma/client.js';
import type { Principal } from '../../../platform/access/principal.js';
import { recordAuditEvent } from '../../../platform/audit/audit-recorder.js';
import type { Env } from '../../../platform/config/env-schema.js';
import type { DatabaseService } from '../../../platform/database/database.service.js';
import type { TenantTransaction } from '../../../platform/database/tenant-context.js';
import { AppError } from '../../../platform/errors/app-error.js';
import type { RequestMeta } from '../../../platform/http/request-meta.js';
import { addOutboxEvent } from '../../../platform/outbox/outbox.js';
import { tenantIdByTaxId } from '../../core/index.js';
import { peopleById } from '../../iam/index.js';

// Ayudas que comparten los casos de uso del sitio (B41): quién actúa, los errores, la auditoría y
// los eventos dentro de la transacción, la empresa del sitio público y los nombres para mostrar.

/** Quien actúa: la persona, un visitante o el sistema (userId null). */
export interface WebActor {
  readonly tenantId: string;
  readonly userId: string | null;
  readonly at: Date;
  readonly meta: RequestMeta | null;
}

export interface Target {
  readonly id: string;
  readonly version: number;
}

export function webActorOf(principal: Principal, at: Date, meta: RequestMeta | null): WebActor {
  return { tenantId: principal.tenantId, userId: principal.userId, at, meta };
}

export function webNotFound(message: string): AppError {
  return new AppError(HttpStatus.NOT_FOUND, SITE_ERROR_CODES.recordNotFound, message);
}

export function webInvalid(message: string): AppError {
  return new AppError(HttpStatus.UNPROCESSABLE_ENTITY, SITE_ERROR_CODES.recordInvalid, message);
}

export function webConflict(message: string): AppError {
  return new AppError(HttpStatus.CONFLICT, SITE_ERROR_CODES.statusInvalid, message);
}

/** El formulario no se puede atender: el sitio no tiene empresa o no hay aviso publicado. */
export function formUnavailable(): AppError {
  return new AppError(
    HttpStatus.SERVICE_UNAVAILABLE,
    SITE_ERROR_CODES.formUnavailable,
    'El formulario no está disponible en este momento. Escríbanos por los medios de contacto.',
  );
}

/** Auditoría y evento del sitio en la misma transacción del cambio. */
export async function recordWebChange(
  tx: TenantTransaction,
  actor: WebActor,
  change: {
    readonly action: string;
    readonly event: string;
    readonly entityType: string;
    readonly entityId: string;
    readonly changes: Prisma.InputJsonObject;
  },
): Promise<void> {
  await recordWebAudit(tx, actor, change);
  await addOutboxEvent(tx, {
    tenantId: actor.tenantId,
    actorId: actor.userId,
    occurredAt: actor.at,
    eventType: change.event,
    payload: { id: change.entityId },
  });
}

/** Solo la auditoría: consultas públicas y cambios que nadie más necesita saber. */
export async function recordWebAudit(
  tx: TenantTransaction,
  actor: WebActor,
  change: {
    readonly action: string;
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
}

/** La empresa del sitio público (PUBLIC_SITE_TAX_ID); null si no está configurada o no existe. */
export async function siteTenantId(
  database: Pick<DatabaseService, 'withoutTenant'>,
  config: Pick<Env, 'PUBLIC_SITE_TAX_ID'>,
): Promise<string | null> {
  const taxId = config.PUBLIC_SITE_TAX_ID;
  if (taxId === undefined) return null;
  return database.withoutTenant((tx) => tenantIdByTaxId(tx, taxId));
}

/** Nombre de cada cuenta, por su identificador. */
export async function userRefs(
  tx: TenantTransaction,
  ids: readonly (string | null)[],
): Promise<Map<string, SiteRef>> {
  const present = ids.filter((id): id is string => id !== null);
  const people = await peopleById(tx, [...new Set(present)]);
  return new Map(
    [...people.values()].map((person) => [
      person.id,
      { id: person.id, name: person.displayName ?? person.email },
    ]),
  );
}

export function optionalRef(refs: ReadonlyMap<string, SiteRef>, id: string | null): SiteRef | null {
  if (id === null) return null;
  return refs.get(id) ?? { id, name: 'Persona' };
}

/** IPv4 sin el último octeto; IPv6 con solo los tres primeros grupos (numeral 20.4). */
export function truncatedIp(ip: string | null): string | null {
  if (ip === null || ip === '') return null;
  const v4 = /^(?:::ffff:)?(\d{1,3}\.\d{1,3}\.\d{1,3})\.\d{1,3}$/u.exec(ip);
  if (v4 !== null) return `${v4[1] ?? ''}.0`;
  if (!ip.includes(':')) return null;
  return `${ip.split(':').slice(0, 3).join(':')}::`;
}

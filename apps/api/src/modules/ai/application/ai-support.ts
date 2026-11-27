import { HttpStatus } from '@nestjs/common';
import { AI_ERROR_CODES, type AiRef } from '@arza/contracts';

import type { Prisma } from '../../../generated/prisma/client.js';
import type { AppAbility } from '../../../platform/access/ability.js';
import type { Principal } from '../../../platform/access/principal.js';
import { recordAuditEvent } from '../../../platform/audit/audit-recorder.js';
import type { TenantTransaction } from '../../../platform/database/tenant-context.js';
import { AppError } from '../../../platform/errors/app-error.js';
import type { RequestMeta } from '../../../platform/http/request-meta.js';
import { addOutboxEvent } from '../../../platform/outbox/outbox.js';
import { peopleById } from '../../iam/index.js';

// Ayudas que comparten los casos de uso del asistente (B47): quién actúa, los errores, la auditoría
// con el evento en la misma transacción y los nombres para mostrar.

/** Quien usa el asistente, con sus permisos: la IA hereda los de la persona (numeral 15.3). */
export interface AiViewer {
  readonly principal: Principal;
  readonly ability: AppAbility;
}

export interface AiActor {
  readonly tenantId: string;
  readonly userId: string | null;
  readonly at: Date;
  readonly meta: RequestMeta | null;
}

export function aiActorOf(principal: Principal, at: Date, meta: RequestMeta | null): AiActor {
  return { tenantId: principal.tenantId, userId: principal.userId, at, meta };
}

export function aiSystemActor(tenantId: string, at: Date): AiActor {
  return { tenantId, userId: null, at, meta: null };
}

export function aiNotFound(message: string): AppError {
  return new AppError(HttpStatus.NOT_FOUND, AI_ERROR_CODES.recordNotFound, message);
}

export function aiInvalid(message: string): AppError {
  return new AppError(HttpStatus.UNPROCESSABLE_ENTITY, AI_ERROR_CODES.recordInvalid, message);
}

export function gatewayOff(): AppError {
  return new AppError(
    HttpStatus.SERVICE_UNAVAILABLE,
    AI_ERROR_CODES.gatewayOff,
    'El asistente de inteligencia artificial no está disponible en esta instalación.',
  );
}

export function useCaseDisabled(): AppError {
  return new AppError(
    HttpStatus.CONFLICT,
    AI_ERROR_CODES.useCaseDisabled,
    'Este uso del asistente no está activo. Lo activa el Oficial de datos tras la evaluación de impacto.',
  );
}

export function dailyLimitReached(limit: number): AppError {
  return new AppError(
    HttpStatus.TOO_MANY_REQUESTS,
    AI_ERROR_CODES.dailyLimit,
    `Ya usó el asistente ${String(limit)} veces hoy. Podrá usarlo de nuevo mañana.`,
  );
}

export function sourceExcluded(detail: string): AppError {
  return new AppError(HttpStatus.UNPROCESSABLE_ENTITY, AI_ERROR_CODES.sourceExcluded, detail);
}

export function providerFailed(): AppError {
  return new AppError(
    HttpStatus.BAD_GATEWAY,
    AI_ERROR_CODES.providerFailed,
    'El asistente no pudo responder en este momento. Intente de nuevo en unos minutos.',
  );
}

/** Auditoría y evento del asistente en la misma transacción del cambio. */
export async function recordAiChange(
  tx: TenantTransaction,
  actor: AiActor,
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

/** Nombre de cada cuenta, por su identificador. */
export async function userRefs(
  tx: TenantTransaction,
  ids: readonly (string | null)[],
): Promise<Map<string, AiRef>> {
  const present = [...new Set(ids.filter((id): id is string => id !== null))];
  const people = await peopleById(tx, present);
  return new Map(
    [...people.values()].map((person) => [
      person.id,
      { id: person.id, name: person.displayName ?? person.email },
    ]),
  );
}

export function refOf(refs: ReadonlyMap<string, AiRef>, id: string | null): AiRef | null {
  return id === null ? null : (refs.get(id) ?? { id, name: 'Persona' });
}

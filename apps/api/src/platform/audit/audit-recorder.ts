import type { Prisma } from '../../generated/prisma/client.js';
import type { TenantTransaction } from '../database/tenant-context.js';
import type { RequestMeta } from '../http/request-meta.js';

// Auditoría (ADR-012): cada caso de uso que escribe inserta su evento dentro de la misma
// transacción. Si la transacción se revierte, el evento también. La base de datos encadena el
// evento por hash (B11) y la API no confirma una escritura sin evento (DatabaseService).

/** Quién actúa: una persona con sesión, el sistema (comandos, worker) o alguien sin sesión. */
type AuditActor =
  | { readonly kind: 'user'; readonly id: string }
  | { readonly kind: 'system' }
  | { readonly kind: 'anonymous' };

export interface AuditEventInput {
  readonly tenantId: string;
  readonly occurredAt: Date;
  readonly actor: AuditActor;
  /** Con el formato de los permisos del anexo G, por ejemplo «iam.session.create». */
  readonly action: string;
  readonly entityType: string;
  readonly entityId: string | null;
  readonly result: 'success' | 'failure';
  /** Lo que cambió. Nunca contraseñas, huellas, llaves ni códigos. */
  readonly changes?: Prisma.InputJsonObject;
  readonly meta: RequestMeta | null;
}

type AuditValue = string | number | boolean | null;

/**
 * Valor anterior y nuevo de cada campo que cambió (ficha 17.20). De los campos restringidos solo
 * queda que cambiaron, nunca su valor.
 */
export function changesBetween<T extends Record<string, AuditValue>>(
  before: T,
  after: T,
  restricted: readonly (keyof T & string)[] = [],
): Prisma.InputJsonObject {
  const changed = Object.keys(after).filter((field) => before[field] !== after[field]);
  return Object.fromEntries(
    changed.map((field): [string, Prisma.InputJsonObject] =>
      restricted.includes(field)
        ? [field, { changed: true }]
        : [field, { from: before[field] ?? null, to: after[field] ?? null }],
    ),
  );
}

export async function recordAuditEvent(
  transaction: TenantTransaction,
  event: AuditEventInput,
): Promise<void> {
  await transaction.auditEvent.create({
    data: {
      tenantId: event.tenantId,
      occurredAt: event.occurredAt,
      actorKind: event.actor.kind,
      actorId: event.actor.kind === 'user' ? event.actor.id : null,
      action: event.action,
      entityType: event.entityType,
      entityId: event.entityId,
      result: event.result,
      changes: event.changes ?? {},
      ip: event.meta?.ip ?? null,
      correlationId: event.meta?.correlationId ?? null,
    },
  });
}

export interface SecurityEventInput {
  readonly tenantId: string;
  readonly occurredAt: Date;
  /** Por ejemplo «iam.account.locked». */
  readonly type: string;
  readonly userId: string | null;
  readonly severity: 'low' | 'medium' | 'high' | 'critical';
  /** Lo que explica el evento. Nunca contraseñas, huellas, llaves ni códigos. */
  readonly detail: Prisma.InputJsonObject;
  readonly meta: RequestMeta;
}

export async function recordSecurityEvent(
  transaction: TenantTransaction,
  event: SecurityEventInput,
): Promise<void> {
  await transaction.securityEvent.create({
    data: {
      tenantId: event.tenantId,
      occurredAt: event.occurredAt,
      type: event.type,
      userId: event.userId,
      severity: event.severity,
      detail: event.detail,
      ip: event.meta.ip,
    },
  });
}

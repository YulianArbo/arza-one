import type {
  AuditEvent as AuditEventView,
  AuditExport as AuditExportView,
  SecurityEvent as SecurityEventView,
} from '@arza/contracts';

import type { AuditEvent, AuditExport, SecurityEvent } from '../../../generated/prisma/client.js';
import type { TenantTransaction } from '../../../platform/database/tenant-context.js';
import { peopleById } from '../../iam/index.js';

// Lo que la API entrega de cada evento, con el nombre y el correo de la persona (módulo de
// identidad, por su interfaz pública).

type People = Awaited<ReturnType<typeof peopleById>>;

interface PersonView {
  readonly id: string | null;
  readonly email: string | null;
  readonly display_name: string | null;
}

function personOf(people: People, id: string | null): PersonView {
  const person = id === null ? undefined : people.get(id);
  return { id, email: person?.email ?? null, display_name: person?.displayName ?? null };
}

function objectOf(value: unknown): Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? Object.fromEntries(Object.entries(value))
    : {};
}

const ACTOR_KINDS = ['user', 'system', 'anonymous'] as const;
const SEVERITIES = ['low', 'medium', 'high', 'critical'] as const;

function auditEventView(people: People, event: AuditEvent): AuditEventView {
  return {
    id: event.id,
    seq: Number(event.seq),
    occurred_at: event.occurredAt.toISOString(),
    actor: {
      kind: ACTOR_KINDS.find((kind) => kind === event.actorKind) ?? 'system',
      ...personOf(people, event.actorId),
    },
    action: event.action,
    entity_type: event.entityType,
    entity_id: event.entityId,
    result: event.result === 'failure' ? 'failure' : 'success',
    changes: objectOf(event.changes),
    ip: event.ip,
    correlation_id: event.correlationId,
    hash: event.hash,
  };
}

export async function auditEventViews(
  tx: TenantTransaction,
  events: readonly AuditEvent[],
): Promise<AuditEventView[]> {
  const people = await peopleById(
    tx,
    events.flatMap((event) => event.actorId ?? []),
  );
  return events.map((event) => auditEventView(people, event));
}

export async function securityEventViews(
  tx: TenantTransaction,
  events: readonly SecurityEvent[],
): Promise<SecurityEventView[]> {
  const people = await peopleById(
    tx,
    events.flatMap((event) => event.userId ?? []),
  );
  return events.map((event) => ({
    id: event.id,
    occurred_at: event.occurredAt.toISOString(),
    type: event.type,
    severity: SEVERITIES.find((severity) => severity === event.severity) ?? 'critical',
    user: event.userId === null ? null : personOf(people, event.userId),
    ip: event.ip,
    detail: objectOf(event.detail),
  }));
}

export async function exportViews(
  tx: TenantTransaction,
  exports: readonly AuditExport[],
): Promise<AuditExportView[]> {
  const people = await peopleById(
    tx,
    exports.map((item) => item.requestedBy),
  );
  return exports.map((item) => ({
    id: item.id,
    requested_by: personOf(people, item.requestedBy),
    scope: objectOf(item.scope),
    row_count: item.rowCount,
    exported_at: item.exportedAt.toISOString(),
  }));
}

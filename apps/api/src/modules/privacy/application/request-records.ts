import type { PrivacyRequestEventKind } from '@arza/contracts';

import type { Prisma, PrivacyRequest } from '../../../generated/prisma/client.js';
import type { TenantTransaction } from '../../../platform/database/tenant-context.js';
import { versionConflict } from '../../../platform/http/if-match.js';
import { auditPrivacy, type PrivacyActor } from './privacy-support.js';
import { requestNotFound } from './request-messages.js';

// Piezas comunes de las solicitudes de titulares (B42): la historia, la búsqueda con bloqueo y el
// cambio con control de versión, siempre con su evento de auditoría.

export interface RequestEventInput {
  readonly kind: PrivacyRequestEventKind;
  readonly note: string | null;
  /** El titular recibe este paso por correo (lo envía el worker). */
  readonly mail: boolean;
}

export async function addRequestEvent(
  tx: TenantTransaction,
  actor: PrivacyActor,
  request: Pick<PrivacyRequest, 'id' | 'requesterEmail'>,
  event: RequestEventInput,
): Promise<void> {
  await tx.privacyRequestEvent.create({
    data: {
      tenantId: actor.tenantId,
      requestId: request.id,
      kind: event.kind,
      note: event.note,
      actorId: actor.userId,
      occurredAt: actor.at,
      mailPending: event.mail && request.requesterEmail !== null,
    },
  });
}

/** La solicitud, bloqueada para que dos personas no la muevan a la vez. */
export async function lockRequest(tx: TenantTransaction, id: string): Promise<PrivacyRequest> {
  await tx.$queryRaw`SELECT id FROM prv_requests WHERE id = ${id}::uuid FOR UPDATE`;
  const row = await tx.privacyRequest.findFirst({ where: { id, deletedAt: null } });
  if (row === null) throw requestNotFound();
  return row;
}

export interface RequestChange {
  readonly action: string;
  readonly data: Prisma.PrivacyRequestUpdateInput;
  readonly changes: Prisma.InputJsonObject;
  readonly event: RequestEventInput | null;
}

/** Aplica el paso con control de versión, deja la historia y la auditoría. */
export async function changeRequest(
  tx: TenantTransaction,
  actor: PrivacyActor,
  before: PrivacyRequest,
  version: number | null,
  change: RequestChange,
): Promise<PrivacyRequest> {
  if (version !== null && version !== before.version) throw versionConflict();
  const after = await tx.privacyRequest.update({ where: { id: before.id }, data: change.data });
  if (change.event !== null) await addRequestEvent(tx, actor, after, change.event);
  await auditPrivacy(tx, actor, {
    action: change.action,
    entityType: 'prv_request',
    entityId: before.id,
    changes: { code: before.code, ...change.changes },
  });
  return after;
}

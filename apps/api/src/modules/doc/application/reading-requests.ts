import type { DocDocument, DocVersion } from '../../../generated/prisma/client.js';
import type { TenantTransaction } from '../../../platform/database/tenant-context.js';
import { addOutboxEvent } from '../../../platform/outbox/outbox.js';
import { activeUsersInPosition } from '../../iam/index.js';
import { auditDoc, type DocActor } from './doc-support.js';

// Pedir la constancia de lectura (B19, ficha 17.4 y numeral 18.2, paso 7): a cada persona de los
// cargos destinatarios (vinculados al documento con «Aplica a») le queda una constancia pendiente
// de la versión vigente y le llega un aviso. Quien ya confirmó no recibe otro.

export interface PublishedVersion {
  readonly document: DocDocument;
  readonly version: DocVersion;
}

interface Reader {
  readonly userId: string;
  readonly positionId: string;
}

/** Personas activas de los cargos destinatarios del documento, cada una con su cargo. */
async function intendedReaders(tx: TenantTransaction, documentId: string): Promise<Reader[]> {
  const links = await tx.docLink.findMany({
    where: { documentId, entityType: 'position', relation: 'applies_to', deletedAt: null },
    orderBy: { createdAt: 'asc' },
  });
  const readers = new Map<string, Reader>();
  for (const link of links) {
    for (const userId of await activeUsersInPosition(tx, link.entityId)) {
      if (!readers.has(userId)) readers.set(userId, { userId, positionId: link.entityId });
    }
  }
  return [...readers.values()];
}

/**
 * Deja pendientes las constancias que faltan y avisa a quienes aún no confirmaron. Al publicar,
 * un documento sin cargos destinatarios no deja nada; cuando una persona lo pide a propósito
 * (`audited`), su pedido queda en la auditoría aunque no haya a quién avisar.
 */
export async function requestReading(
  tx: TenantTransaction,
  actor: DocActor,
  published: PublishedVersion,
  options: { readonly audited: boolean } = { audited: false },
): Promise<number> {
  const { document, version } = published;
  const readers = await intendedReaders(tx, document.id);
  if (readers.length === 0) {
    if (options.audited) await announce(tx, actor, published, []);
    return 0;
  }
  const base = { tenantId: actor.tenantId, documentId: document.id, versionId: version.id };
  await tx.docAcknowledgement.createMany({
    data: readers.map((reader) => ({ ...base, ...reader, requestedAt: actor.at })),
    skipDuplicates: true,
  });
  const pending = await tx.docAcknowledgement.findMany({
    where: { versionId: version.id, acknowledgedAt: null, deletedAt: null },
    select: { id: true, userId: true },
  });
  await tx.docAcknowledgement.updateMany({
    where: { id: { in: pending.map((row) => row.id) } },
    data: { requestedAt: actor.at },
  });
  const userIds = pending.map((row) => row.userId);
  await announce(tx, actor, published, userIds);
  return userIds.length;
}

async function announce(
  tx: TenantTransaction,
  actor: DocActor,
  { document, version }: PublishedVersion,
  userIds: readonly string[],
): Promise<void> {
  await auditDoc(tx, actor, {
    action: 'doc.acknowledgement.request',
    entityType: 'doc_version',
    entityId: version.id,
    changes: { code: document.code, label: version.versionLabel, people: userIds.length },
  });
  if (userIds.length === 0) return;
  await addOutboxEvent(tx, {
    tenantId: actor.tenantId,
    eventType: 'doc.acknowledgement.requested',
    actorId: actor.userId,
    occurredAt: actor.at,
    payload: {
      document_id: document.id,
      code: document.code,
      version_label: version.versionLabel,
      user_ids: [...userIds],
    },
  });
}

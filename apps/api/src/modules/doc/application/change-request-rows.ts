import type { ChangeRequestAction } from '@arza/contracts';

import type { DocChangeRequest } from '../../../generated/prisma/client.js';
import type { TenantTransaction } from '../../../platform/database/tenant-context.js';
import { auditDoc, type DocActor } from './doc-support.js';
import { changeRequestInvalid, changeRequestRequired } from './request-messages.js';

// La Solicitud de Acción Documental vista desde los documentos (B19): un documento del SGC nuevo,
// una versión nueva o declarar obsoleto un documento necesitan una solicitud aprobada que pida
// exactamente eso; al publicarse la versión (o al declararse obsoleto) la solicitud queda ejecutada.

/** Lo que el cambio va a hacer, para revisar que la solicitud lo pidió. */
export interface IntendedChange {
  readonly action: ChangeRequestAction;
  /** Documento que se modifica o se declara obsoleto; null en una creación. */
  readonly documentId: string | null;
  readonly docType?: string;
  readonly processId?: string | null;
}

function mismatch(request: DocChangeRequest, change: IntendedChange): string | null {
  if (request.status !== 'approved') return 'no está aprobada o ya se ejecutó.';
  if (request.action !== change.action) return 'pide otra acción.';
  if (change.action === 'create') {
    if (request.documentId !== null) return 'ya se usó para crear un documento.';
    const same = request.docType === change.docType && request.processId === change.processId;
    return same ? null : 'pidió otro tipo de documento u otro proceso.';
  }
  return request.documentId === change.documentId ? null : 'es de otro documento.';
}

/** La solicitud aprobada, sin ejecutar, que pide este cambio. La bloquea hasta el final. */
export async function usableChangeRequest(
  tx: TenantTransaction,
  id: string | null,
  change: IntendedChange,
): Promise<DocChangeRequest> {
  if (id === null) throw changeRequestRequired();
  await tx.$queryRaw`SELECT id FROM doc_change_requests WHERE id = ${id}::uuid FOR UPDATE`;
  const request = await tx.docChangeRequest.findFirst({ where: { id, deletedAt: null } });
  if (request === null) throw changeRequestInvalid('no existe.');
  const problem = mismatch(request, change);
  if (problem !== null) throw changeRequestInvalid(problem);
  const used = await tx.docVersion.count({ where: { changeRequestId: id } });
  if (used > 0) throw changeRequestInvalid('ya tiene una versión.');
  return request;
}

/** Una solicitud de creación queda ligada al documento que se creó con ella. */
export async function attachCreatedDocument(
  tx: TenantTransaction,
  requestId: string,
  documentId: string,
): Promise<void> {
  await tx.docChangeRequest.update({ where: { id: requestId }, data: { documentId } });
}

export async function executeChangeRequest(
  tx: TenantTransaction,
  actor: DocActor,
  requestId: string,
): Promise<void> {
  const request = await tx.docChangeRequest.update({
    where: { id: requestId },
    data: { status: 'executed', executedAt: actor.at },
  });
  await auditDoc(tx, actor, {
    action: 'doc.change_request.execute',
    entityType: 'doc_change_request',
    entityId: request.id,
    changes: { code: request.code, document_id: request.documentId },
  });
}

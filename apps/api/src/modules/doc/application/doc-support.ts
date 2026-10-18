import type { Prisma } from '../../../generated/prisma/client.js';
import {
  hasPermission,
  hasUnconditionalPermission,
  type AppAbility,
} from '../../../platform/access/ability.js';
import type { Principal } from '../../../platform/access/principal.js';
import { recordAuditEvent } from '../../../platform/audit/audit-recorder.js';
import type { TenantTransaction } from '../../../platform/database/tenant-context.js';
import type { RequestMeta } from '../../../platform/http/request-meta.js';
import { positionsById } from '../../core/index.js';
import { positionOfUser } from '../../iam/index.js';
import { taskActorOf, type TaskActor } from '../../wf/index.js';

// Piezas comunes de documentos, versiones y expedientes (B18).

/** Quién escribe: una persona con sesión, o el sistema (la semilla y el worker). */
export interface DocActor {
  readonly tenantId: string;
  /** null cuando actúa el sistema. */
  readonly userId: string | null;
  readonly meta: RequestMeta | null;
  readonly at: Date;
}

export function actorOf(principal: Principal, meta: RequestMeta, at: Date): DocActor {
  return { tenantId: principal.tenantId, userId: principal.userId, meta, at };
}

export interface DocChange {
  readonly action: string;
  readonly entityType:
    | 'doc_folder'
    | 'doc_document'
    | 'doc_version'
    | 'doc_link'
    | 'doc_change_request'
    | 'doc_acknowledgement'
    | 'doc_form_template'
    | 'doc_form_record'
    | 'doc_output_template'
    | 'doc_retention_rule'
    | 'doc_disposition_proposal'
    | 'doc_disposition'
    | 'doc_version_text';
  readonly entityId: string | null;
  readonly changes: Prisma.InputJsonObject;
}

/** Evento de auditoría de cada escritura, en la misma transacción (ADR-012). */
export async function auditDoc(
  tx: TenantTransaction,
  actor: DocActor,
  change: DocChange,
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

/**
 * Bloqueo por documento dentro de la transacción: dos personas que crean o publican versiones del
 * mismo documento a la vez se turnan. No escribe nada, así que no cuenta como escritura.
 */
export async function lockDocument(
  tx: TenantTransaction,
  tenantId: string,
  documentId: string,
): Promise<void> {
  const name = `doc:${tenantId}:${documentId}`;
  await tx.$queryRaw`SELECT 1 AS locked FROM (SELECT pg_advisory_xact_lock(hashtextextended(${name}, 0))) AS taken`;
}

/**
 * Lo que la persona puede ver y hacer en la gestión documental (numeral 15.4). Quien solo ve «lo
 * propio» (Colaborador) ve los documentos que creó y los vigentes de su proceso; lo restringido
 * exige además el permiso nominal.
 */
export interface DocReader {
  readonly userId: string;
  readonly readsAll: boolean;
  readonly readsRestricted: boolean;
  /** Proceso del cargo de la persona; null si no tiene cargo. */
  readonly processId: string | null;
  readonly canCreate: boolean;
  readonly canEdit: boolean;
  readonly canSubmit: boolean;
  readonly canReview: boolean;
  readonly canApprove: boolean;
  readonly canPublish: boolean;
  readonly canObsolete: boolean;
  readonly canDecideRequests: boolean;
  /** Quién es la persona para el motor de flujos; se calcula solo si hace falta. */
  readonly taskActor: (at: Date) => Promise<TaskActor>;
}

async function processOfUser(tx: TenantTransaction, userId: string): Promise<string | null> {
  const positionId = await positionOfUser(tx, userId);
  if (positionId === null) return null;
  return (await positionsById(tx, [positionId])).get(positionId)?.orgUnitId ?? null;
}

/** Calcula una sola vez, con el momento de la primera petición. */
function once<T>(load: (at: Date) => Promise<T>): (at: Date) => Promise<T> {
  let loaded: Promise<T> | null = null;
  return (at) => (loaded ??= load(at));
}

export async function readerOf(
  tx: TenantTransaction,
  principal: Principal,
  ability: AppAbility,
): Promise<DocReader> {
  const readsAll = hasUnconditionalPermission(ability, 'doc.document.read');
  return {
    userId: principal.userId,
    readsAll,
    readsRestricted: hasUnconditionalPermission(ability, 'doc.restricted.read'),
    processId: readsAll ? null : await processOfUser(tx, principal.userId),
    canCreate: hasPermission(ability, 'doc.document.create'),
    canEdit: hasPermission(ability, 'doc.document.update'),
    canSubmit: hasPermission(ability, 'doc.version.submit'),
    canReview: hasPermission(ability, 'doc.version.review'),
    canApprove: hasPermission(ability, 'doc.version.approve'),
    canPublish: hasPermission(ability, 'doc.version.publish'),
    canObsolete: hasPermission(ability, 'doc.version.obsolete'),
    canDecideRequests: hasPermission(ability, 'doc.change_request.decide'),
    taskActor: once((at) => taskActorOf(tx, principal, ability, at)),
  };
}

/** Documentos que la persona puede ver. */
export function visibleDocuments(reader: DocReader): Prisma.DocDocumentWhereInput {
  const base: Prisma.DocDocumentWhereInput = reader.readsRestricted
    ? { deletedAt: null }
    : { deletedAt: null, classification: { not: 'restricted' } };
  if (reader.readsAll) return base;
  const ofProcess: Prisma.DocDocumentWhereInput[] =
    reader.processId === null ? [] : [{ status: 'current', processId: reader.processId }];
  return { AND: [base, { OR: [{ createdBy: reader.userId }, ...ofProcess] }] };
}

/** Versiones visibles de un documento: quien solo ve lo propio ve la vigente de lo ajeno. */
export function visibleVersions(
  reader: DocReader,
  document: { readonly createdBy: string | null },
): Prisma.DocVersionWhereInput {
  if (reader.readsAll || document.createdBy === reader.userId) return { deletedAt: null };
  return { deletedAt: null, status: 'current' };
}

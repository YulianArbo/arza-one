import { Inject, Injectable } from '@nestjs/common';
import type {
  CreateDocumentRequest,
  Document,
  DocumentListQuery,
  DocumentListResponse,
} from '@arza/contracts';

import type { DocDocument, Prisma } from '../../../generated/prisma/client.js';
import type { AppAbility } from '../../../platform/access/ability.js';
import type { Principal } from '../../../platform/access/principal.js';
import { CLOCK, type Clock } from '../../../platform/clock/clock.js';
import { DatabaseService } from '../../../platform/database/database.service.js';
import type { TenantTransaction } from '../../../platform/database/tenant-context.js';
import type { RequestMeta } from '../../../platform/http/request-meta.js';
import { JobQueue } from '../../../platform/queues/job-queue.js';
import { nextBusinessCode, nextPlainCode } from '../../core/index.js';
import { CASE_DOCUMENT_SEQUENCE, controlledCodeSequence } from '../domain/document-rules.js';
import { logRestrictedView } from './access-log.js';
import {
  activeProcess,
  assertDocumentType,
  assertPosition,
  versionSource,
} from './doc-references.js';
import { documentNotFound } from './doc-messages.js';
import {
  actorOf,
  auditDoc,
  readerOf,
  visibleDocuments,
  type DocActor,
  type DocReader,
} from './doc-support.js';
import { documentViews } from './document-views.js';
import { findFolder } from './folders.js';
import { createVersionRow } from './version-rows.js';

// Documentos (B18, ficha 17.4): el documento nace con su versión 00 en borrador y su código. Un
// documento del SGC toma TIPO-PROCESO-NNN (PR-SGC-001) sin saltos; uno de expediente, DOC-AAAA-NNNN.

const CASE_DOCUMENTS = { name: 'Documentos de expedientes', prefix: 'DOC', padding: 4 } as const;

export async function visibleDocument(
  tx: TenantTransaction,
  reader: DocReader,
  id: string,
): Promise<DocDocument | null> {
  return tx.docDocument.findFirst({ where: { AND: [{ id }, visibleDocuments(reader)] } });
}

export async function findVisibleDocument(
  tx: TenantTransaction,
  reader: DocReader,
  id: string,
): Promise<DocDocument> {
  const document = await visibleDocument(tx, reader, id);
  if (document === null) throw documentNotFound();
  return document;
}

/** Quien ve todo o quien creó el documento ve también la versión en trámite. */
function seesOpenVersions(reader: DocReader): (doc: DocDocument) => boolean {
  return (doc) => reader.readsAll || doc.createdBy === reader.userId;
}

function listWhere(reader: DocReader, query: DocumentListQuery): Prisma.DocDocumentWhereInput {
  const filters: Prisma.DocDocumentWhereInput[] = [visibleDocuments(reader)];
  if (query.folder_id !== undefined) filters.push({ folderId: query.folder_id });
  if (query.status !== undefined) filters.push({ status: query.status });
  if (query.q !== undefined) {
    const contains = { contains: query.q, mode: 'insensitive' } as const;
    filters.push({ OR: [{ code: contains }, { title: contains }] });
  }
  return { AND: filters };
}

/** Código del documento nuevo, tomado en la misma transacción que lo crea. */
async function documentCode(
  tx: TenantTransaction,
  actor: DocActor,
  input: CreateDocumentRequest,
): Promise<string> {
  if (!input.is_controlled || input.process_id === null) {
    if (input.process_id !== null) await activeProcess(tx, input.process_id);
    return nextBusinessCode(tx, CASE_DOCUMENT_SEQUENCE, actor.at, CASE_DOCUMENTS);
  }
  const process = await activeProcess(tx, input.process_id);
  return nextPlainCode(tx, controlledCodeSequence(input.doc_type, process.code));
}

@Injectable()
export class DocumentsUseCase {
  constructor(
    @Inject(DatabaseService) private readonly database: DatabaseService,
    @Inject(CLOCK) private readonly clock: Clock,
    @Inject(JobQueue) private readonly queue: JobQueue,
  ) {}

  async list(
    principal: Principal,
    ability: AppAbility,
    query: DocumentListQuery,
  ): Promise<DocumentListResponse> {
    return this.database.withTenant(principal, async (tx) => {
      const reader = await readerOf(tx, principal, ability);
      const after = query.cursor === undefined ? null : await this.cursorCode(tx, query.cursor);
      const rows = await tx.docDocument.findMany({
        where: { AND: [listWhere(reader, query), after === null ? {} : { code: { gt: after } }] },
        orderBy: { code: 'asc' },
        take: query.limit + 1,
      });
      const page = rows.slice(0, query.limit);
      const next = rows.length > query.limit ? (page.at(-1)?.id ?? null) : null;
      return { data: await documentViews(tx, page, seesOpenVersions(reader)), next_cursor: next };
    });
  }

  /** Un documento; consultar uno restringido queda en el registro de accesos. */
  async get(
    principal: Principal,
    ability: AppAbility,
    id: string,
    meta: RequestMeta,
  ): Promise<Document> {
    const actor = { ...actorOf(principal, meta, this.clock.now()), userId: principal.userId };
    return this.database.withTenant(principal, async (tx) => {
      const reader = await readerOf(tx, principal, ability);
      const document = await findVisibleDocument(tx, reader, id);
      await logRestrictedView(tx, actor, document);
      const [view] = await documentViews(tx, [document], seesOpenVersions(reader));
      if (view === undefined) throw documentNotFound();
      return view;
    });
  }

  async create(
    principal: Principal,
    input: CreateDocumentRequest,
    meta: RequestMeta,
  ): Promise<string> {
    const actor = actorOf(principal, meta, this.clock.now());
    return this.database.withTenant(principal, async (tx) => {
      await findFolder(tx, input.folder_id);
      await assertDocumentType(tx, input.doc_type);
      await assertPosition(tx, input.owner_position_id);
      const source = await versionSource(tx, principal.userId, input.source_file_id);
      const document = await this.createDocumentRow(tx, actor, input);
      await createVersionRow(tx, actor, this.queue, {
        documentId: document.id,
        number: 0,
        input,
        source,
      });
      return document.id;
    });
  }

  private async createDocumentRow(
    tx: TenantTransaction,
    actor: DocActor,
    input: CreateDocumentRequest,
  ): Promise<DocDocument> {
    const document = await tx.docDocument.create({
      data: {
        tenantId: actor.tenantId,
        folderId: input.folder_id,
        code: await documentCode(tx, actor, input),
        title: input.title,
        docType: input.doc_type,
        processId: input.process_id,
        classification: input.classification,
        ownerPositionId: input.owner_position_id,
        isControlled: input.is_controlled,
      },
    });
    await auditDoc(tx, actor, {
      action: 'doc.document.create',
      entityType: 'doc_document',
      entityId: document.id,
      changes: { code: document.code, title: document.title, folder_id: document.folderId },
    });
    return document;
  }

  private async cursorCode(tx: TenantTransaction, id: string): Promise<string | null> {
    const row = await tx.docDocument.findFirst({ where: { id }, select: { code: true } });
    return row?.code ?? null;
  }
}

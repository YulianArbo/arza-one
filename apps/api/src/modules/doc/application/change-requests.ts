import { Inject, Injectable } from '@nestjs/common';
import {
  TYPES_WITHOUT_PROCESS,
  type ChangeRequest,
  type ChangeRequestListQuery,
  type ChangeRequestListResponse,
  type ChangeRequestStep,
  type ChangeRequestStepRequest,
  type CreateChangeRequest,
} from '@arza/contracts';

import type { DocChangeRequest, Prisma } from '../../../generated/prisma/client.js';
import { hasPermission, type AppAbility } from '../../../platform/access/ability.js';
import type { Principal } from '../../../platform/access/principal.js';
import { CLOCK, type Clock } from '../../../platform/clock/clock.js';
import { DatabaseService } from '../../../platform/database/database.service.js';
import type { TenantTransaction } from '../../../platform/database/tenant-context.js';
import { versionConflict } from '../../../platform/http/if-match.js';
import type { RequestMeta } from '../../../platform/http/request-meta.js';
import { nextBusinessCode } from '../../core/index.js';
import { decideAsParticipant, requestTransition, startWorkflow } from '../../wf/index.js';
import { CHANGE_REQUEST_FLOW } from '../domain/doc-flows.js';
import { activeProcess, assertDocumentType } from './doc-references.js';
import { actorOf, auditDoc, readerOf, type DocActor, type DocReader } from './doc-support.js';
import { changeRequestViews, visibleRequests } from './change-request-views.js';
import { findVisibleDocument } from './documents.js';
import { referenceInvalid } from './doc-messages.js';
import { changeRequestNotFound, changeRequestOpen } from './request-messages.js';

// Solicitud de Acción Documental (B19, FT-SGC-001): cualquiera con el permiso pide crear,
// modificar o eliminar un documento del SGC; el trámite lo lleva el motor de flujos y la solicitud
// sigue sus pasos (change-request-flow.ts). Lleva el código SAD-AAAA-NNNN.

const REQUEST_SEQUENCE = 'doc.change_request';
const REQUESTS = { name: 'Solicitudes de acción documental', prefix: 'SAD', padding: 4 } as const;
const OPEN_REQUEST_STATUSES = ['filed', 'in_analysis', 'approved'];

interface RequestTarget {
  readonly documentId: string | null;
  readonly docType: string | null;
  readonly processId: string | null;
  readonly title: string;
}

/** Lo que pide la solicitud, ya revisado contra el catálogo, los procesos y los documentos. */
async function targetOf(
  tx: TenantTransaction,
  reader: DocReader,
  input: CreateChangeRequest,
): Promise<RequestTarget> {
  if (input.action === 'create') {
    const docType = input.doc_type ?? '';
    await assertDocumentType(tx, docType);
    const withoutProcess = TYPES_WITHOUT_PROCESS.includes(docType);
    if (withoutProcess !== (input.process_id === null)) throw referenceInvalid();
    if (input.process_id !== null) await activeProcess(tx, input.process_id);
    const title = input.title ?? '';
    return { documentId: null, docType, processId: input.process_id, title };
  }
  const document = await findVisibleDocument(tx, reader, input.document_id ?? '');
  if (!document.isControlled || document.status !== 'current') throw referenceInvalid();
  const open = await tx.docChangeRequest.count({
    where: { documentId: document.id, status: { in: OPEN_REQUEST_STATUSES }, deletedAt: null },
  });
  if (open > 0) throw changeRequestOpen();
  return { documentId: document.id, docType: null, processId: null, title: document.title };
}

function listWhere(
  reader: DocReader,
  query: ChangeRequestListQuery,
): Prisma.DocChangeRequestWhereInput {
  const filters: Prisma.DocChangeRequestWhereInput[] = [visibleRequests(reader)];
  if (query.status !== undefined) filters.push({ status: query.status });
  if (query.document_id !== undefined) filters.push({ documentId: query.document_id });
  if (query.usable !== undefined) {
    filters.push({ status: 'approved', action: query.usable, versions: { none: {} } });
    if (query.usable === 'create') filters.push({ documentId: null });
  }
  return { AND: filters };
}

@Injectable()
export class ChangeRequestsUseCase {
  constructor(
    @Inject(DatabaseService) private readonly database: DatabaseService,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  async create(
    principal: Principal,
    ability: AppAbility,
    input: CreateChangeRequest,
    meta: RequestMeta,
  ): Promise<string> {
    const actor = actorOf(principal, meta, this.clock.now());
    return this.database.withTenant(principal, async (tx) => {
      const reader = await readerOf(tx, principal, ability);
      const target = await targetOf(tx, reader, input);
      const code = await nextBusinessCode(tx, REQUEST_SEQUENCE, actor.at, REQUESTS);
      const request = await tx.docChangeRequest.create({
        data: {
          tenantId: actor.tenantId,
          code,
          action: input.action,
          ...target,
          justification: input.justification,
          requestedBy: principal.userId,
        },
      });
      await this.startFlow(tx, actor, request);
      return request.id;
    });
  }

  async list(
    principal: Principal,
    ability: AppAbility,
    query: ChangeRequestListQuery,
  ): Promise<ChangeRequestListResponse> {
    const at = this.clock.now();
    return this.database.withTenant(principal, async (tx) => {
      const reader = await readerOf(tx, principal, ability);
      const rows = await tx.docChangeRequest.findMany({
        where: listWhere(reader, query),
        orderBy: { id: 'desc' },
        ...(query.cursor === undefined ? {} : { cursor: { id: query.cursor }, skip: 1 }),
        take: query.limit + 1,
      });
      const page = rows.slice(0, query.limit);
      const next = rows.length > query.limit ? (page.at(-1)?.id ?? null) : null;
      return { data: await changeRequestViews(tx, reader, page, at), next_cursor: next };
    });
  }

  async get(principal: Principal, ability: AppAbility, id: string): Promise<ChangeRequest> {
    const at = this.clock.now();
    return this.database.withTenant(principal, async (tx) => {
      const reader = await readerOf(tx, principal, ability);
      const request = await this.findVisible(tx, reader, id);
      const [view] = await changeRequestViews(tx, reader, [request], at);
      if (view === undefined) throw changeRequestNotFound();
      return view;
    });
  }

  /** Empezar el análisis, aprobar o rechazar: el motor valida el paso y la solicitud lo sigue. */
  async step(
    request: { principal: Principal; ability: AppAbility; meta: RequestMeta },
    target: { readonly id: string; readonly version: number },
    step: ChangeRequestStep,
    input: ChangeRequestStepRequest,
  ): Promise<void> {
    const { principal, ability, meta } = request;
    const actor = actorOf(principal, meta, this.clock.now());
    await this.database.withTenant(principal, async (tx) => {
      const reader = await readerOf(tx, principal, ability);
      const found = await this.findVisible(tx, reader, target.id);
      if (found.version !== target.version) throw versionConflict();
      const instanceId = found.workflowInstanceId ?? '';
      const taskActor = await reader.taskActor(actor.at);
      if (step === 'analyze') {
        const check = (code: Parameters<typeof hasPermission>[1]) => hasPermission(ability, code);
        const ask = { instanceId, action: step, comment: input.comment, facts: {} };
        await requestTransition(tx, actor, { ...ask, actor: taskActor, hasPermission: check });
        return;
      }
      const decision = step === 'approve' ? 'approved' : 'rejected';
      const ask = { instanceId, actor: taskActor, decision, comment: input.comment } as const;
      await decideAsParticipant(tx, actor, ask);
    });
  }

  private async findVisible(
    tx: TenantTransaction,
    reader: DocReader,
    id: string,
  ): Promise<DocChangeRequest> {
    const request = await tx.docChangeRequest.findFirst({
      where: { AND: [{ id }, visibleRequests(reader)] },
    });
    if (request === null) throw changeRequestNotFound();
    return request;
  }

  private async startFlow(
    tx: TenantTransaction,
    actor: DocActor,
    request: DocChangeRequest,
  ): Promise<void> {
    const instance = await startWorkflow(tx, actor, {
      key: CHANGE_REQUEST_FLOW,
      entityType: CHANGE_REQUEST_FLOW,
      entityId: request.id,
      title: `${request.code} · ${request.title}`,
      facts: { action: request.action },
    });
    await tx.docChangeRequest.update({
      where: { id: request.id },
      data: { workflowInstanceId: instance.id },
    });
    await auditDoc(tx, actor, {
      action: 'doc.change_request.create',
      entityType: 'doc_change_request',
      entityId: request.id,
      changes: {
        code: request.code,
        action: request.action,
        document_id: request.documentId,
        title: request.title,
      },
    });
  }
}

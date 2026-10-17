import { Inject, Injectable } from '@nestjs/common';
import type { CreateVersionRequest, UpdateVersionRequest, Version } from '@arza/contracts';

import type { DocDocument, DocVersion, File } from '../../../generated/prisma/client.js';
import type { AppAbility } from '../../../platform/access/ability.js';
import type { Principal } from '../../../platform/access/principal.js';
import { changesBetween } from '../../../platform/audit/audit-recorder.js';
import { CLOCK, type Clock } from '../../../platform/clock/clock.js';
import { DatabaseService } from '../../../platform/database/database.service.js';
import type { TenantTransaction } from '../../../platform/database/tenant-context.js';
import { versionConflict } from '../../../platform/http/if-match.js';
import type { RequestMeta } from '../../../platform/http/request-meta.js';
import { JobQueue } from '../../../platform/queues/job-queue.js';
import { nextVersionNumber, OPEN_STATUSES } from '../domain/document-rules.js';
import { assertPosition, versionSource } from './doc-references.js';
import { versionInProgress, versionNotEditable, versionNotFound } from './doc-messages.js';
import {
  actorOf,
  auditDoc,
  lockDocument,
  readerOf,
  visibleVersions,
  type DocReader,
} from './doc-support.js';
import { findVisibleDocument, visibleDocument } from './documents.js';
import { createVersionRow, draftContent, requestRender } from './version-rows.js';
import { versionViews } from './version-views.js';

// Versiones de un documento (B18, ficha 17.4): una nueva solo cuando no hay otra en trámite; el
// borrador solo lo cambia quien lo elaboró. Una vigente es inmutable: cambiarla exige otra versión.

export interface VisibleVersion {
  readonly document: DocDocument;
  readonly version: DocVersion;
}

/** La versión, si la persona puede ver su documento y la versión misma. */
export async function findVisibleVersion(
  tx: TenantTransaction,
  reader: DocReader,
  id: string,
): Promise<VisibleVersion> {
  const version = await tx.docVersion.findFirst({ where: { id, deletedAt: null } });
  if (version === null) throw versionNotFound();
  const document = await visibleDocument(tx, reader, version.documentId);
  if (document === null) throw versionNotFound();
  const visible = await tx.docVersion.count({
    where: { AND: [{ id }, visibleVersions(reader, document)] },
  });
  if (visible === 0) throw versionNotFound();
  return { document, version };
}

/** Cambios del borrador. El archivo y su PDF solo cambian si llega otro archivo fuente. */
function draftChanges(before: DocVersion, input: UpdateVersionRequest, source: File) {
  if (source.id !== before.sourceFileId) return draftContent(input, source);
  return {
    title: input.title,
    classification: input.classification,
    ownerPositionId: input.owner_position_id,
    changeSummary: input.change_summary,
  };
}

/** Si el documento nunca se publicó, sus datos acompañan al borrador. */
async function followDraft(
  tx: TenantTransaction,
  document: DocDocument,
  input: UpdateVersionRequest,
): Promise<void> {
  if (document.status !== 'draft') return;
  await tx.docDocument.update({
    where: { id: document.id },
    data: {
      title: input.title,
      classification: input.classification,
      ownerPositionId: input.owner_position_id,
    },
  });
}

function draftAudit(version: DocVersion) {
  return {
    title: version.title,
    classification: version.classification,
    source_file_id: version.sourceFileId,
    change_summary: version.changeSummary,
  };
}

@Injectable()
export class VersionsUseCase {
  constructor(
    @Inject(DatabaseService) private readonly database: DatabaseService,
    @Inject(CLOCK) private readonly clock: Clock,
    @Inject(JobQueue) private readonly queue: JobQueue,
  ) {}

  async list(principal: Principal, ability: AppAbility, documentId: string): Promise<Version[]> {
    return this.database.withTenant(principal, async (tx) => {
      const reader = await readerOf(tx, principal, ability);
      const document = await findVisibleDocument(tx, reader, documentId);
      const versions = await tx.docVersion.findMany({
        where: { AND: [{ documentId }, visibleVersions(reader, document)] },
        orderBy: { number: 'desc' },
      });
      return versionViews(tx, versions, reader);
    });
  }

  /** Versión nueva en borrador: el número siguiente, con el bloqueo del documento. */
  async create(
    principal: Principal,
    ability: AppAbility,
    documentId: string,
    input: CreateVersionRequest,
    meta: RequestMeta,
  ): Promise<string> {
    const actor = actorOf(principal, meta, this.clock.now());
    return this.database.withTenant(principal, async (tx) => {
      const reader = await readerOf(tx, principal, ability);
      const document = await findVisibleDocument(tx, reader, documentId);
      await assertPosition(tx, input.owner_position_id);
      const source = await versionSource(tx, principal.userId, input.source_file_id);
      await lockDocument(tx, actor.tenantId, document.id);
      const latest = await tx.docVersion.findFirst({
        where: { documentId: document.id },
        orderBy: { number: 'desc' },
      });
      if (latest !== null && OPEN_STATUSES.some((s) => s === latest.status))
        throw versionInProgress();
      const number = nextVersionNumber(latest?.number ?? null);
      const draft = { documentId: document.id, number, input, source };
      return (await createVersionRow(tx, actor, this.queue, draft)).id;
    });
  }

  /** Corrige el borrador propio; si el documento nunca se publicó, sus datos lo acompañan. */
  async update(
    principal: Principal,
    ability: AppAbility,
    target: { readonly id: string; readonly version: number },
    input: UpdateVersionRequest,
    meta: RequestMeta,
  ): Promise<void> {
    const actor = actorOf(principal, meta, this.clock.now());
    await this.database.withTenant(principal, async (tx) => {
      const reader = await readerOf(tx, principal, ability);
      const { document, version: before } = await findVisibleVersion(tx, reader, target.id);
      if (before.status !== 'draft' || before.createdBy !== principal.userId) {
        throw versionNotEditable();
      }
      await assertPosition(tx, input.owner_position_id);
      const source = await versionSource(tx, principal.userId, input.source_file_id);
      const { count } = await tx.docVersion.updateMany({
        where: { id: before.id, version: target.version },
        data: draftChanges(before, input, source),
      });
      if (count === 0) throw versionConflict();
      await followDraft(tx, document, input);
      const after = await tx.docVersion.findUniqueOrThrow({ where: { id: before.id } });
      await auditDoc(tx, actor, {
        action: 'doc.version.update',
        entityType: 'doc_version',
        entityId: before.id,
        changes: changesBetween(draftAudit(before), draftAudit(after)),
      });
      if (after.sourceFileId !== before.sourceFileId) await requestRender(this.queue, actor, after);
    });
  }
}

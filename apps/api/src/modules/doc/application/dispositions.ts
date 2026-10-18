import { createHash } from 'node:crypto';

import { Inject, Injectable } from '@nestjs/common';
import type {
  DispositionDecision,
  DispositionItemDecision,
  DispositionListQuery,
  DispositionListResponse,
  DispositionProposalDetail,
  DispositionStepRequest,
  DownloadLinkResponse,
  ProposeDispositionsResponse,
} from '@arza/contracts';

import type { DocDispositionProposal, File } from '../../../generated/prisma/client.js';
import { hasPermission, type AppAbility } from '../../../platform/access/ability.js';
import type { Principal } from '../../../platform/access/principal.js';
import { recordSecurityEvent } from '../../../platform/audit/audit-recorder.js';
import { CLOCK, type Clock } from '../../../platform/clock/clock.js';
import { DatabaseService } from '../../../platform/database/database.service.js';
import type { TenantTransaction } from '../../../platform/database/tenant-context.js';
import { versionConflict } from '../../../platform/http/if-match.js';
import type { RequestMeta } from '../../../platform/http/request-meta.js';
import { decideAsParticipant, requestTransition, taskActorOf } from '../../wf/index.js';
import { FileStorage } from '../infrastructure/file-storage.js';
import { integrityFailed, pdfNotReady } from './doc-messages.js';
import { actorOf, auditDoc } from './doc-support.js';
import { proposalViews, dispositionReaderOf, itemViews } from './disposition-views.js';
import { proposeForTenant } from './disposition-proposals.js';
import { FileLinkIssuer } from './file-link-issuer.js';
import { dispositionNotEditable, dispositionNotFound } from './retention-messages.js';

// Disposición final (B21, RE-SGC-005): las propuestas mensuales con sus documentos. Calidad decide
// conservar un documento (con su motivo) mientras revisa la propuesta y la envía; Dirección la
// aprueba o la rechaza en el motor de flujos (disposition-flow.ts). La ejecuta el worker
// (disposition-execution.ts) y deja el acta en PDF, que se descarga con su huella verificada.

interface Request {
  readonly principal: Principal;
  readonly ability: AppAbility;
  readonly meta: RequestMeta;
}

interface Target {
  readonly id: string;
  readonly version: number;
}

async function findProposal(tx: TenantTransaction, id: string): Promise<DocDispositionProposal> {
  const proposal = await tx.docDispositionProposal.findFirst({ where: { id, deletedAt: null } });
  if (proposal === null) throw dispositionNotFound();
  return proposal;
}

async function readyCertificate(
  tx: TenantTransaction,
  id: string,
): Promise<{ proposal: DocDispositionProposal; file: File }> {
  const proposal = await findProposal(tx, id);
  const file =
    proposal.certificateFileId === null
      ? null
      : await tx.file.findFirst({
          where: { id: proposal.certificateFileId, scanStatus: 'available' },
        });
  if (file === null) throw pdfNotReady();
  return { proposal, file };
}

@Injectable()
export class DispositionsUseCase {
  constructor(
    @Inject(DatabaseService) private readonly database: DatabaseService,
    @Inject(CLOCK) private readonly clock: Clock,
    @Inject(FileStorage) private readonly storage: FileStorage,
    @Inject(FileLinkIssuer) private readonly issuer: FileLinkIssuer,
  ) {}

  async list(
    principal: Principal,
    ability: AppAbility,
    query: DispositionListQuery,
  ): Promise<DispositionListResponse> {
    const at = this.clock.now();
    return this.database.withTenant(principal, async (tx) => {
      const rows = await tx.docDispositionProposal.findMany({
        where: { deletedAt: null, ...(query.status === undefined ? {} : { status: query.status }) },
        orderBy: { id: 'desc' },
        ...(query.cursor === undefined ? {} : { cursor: { id: query.cursor }, skip: 1 }),
        take: query.limit + 1,
      });
      const page = rows.slice(0, query.limit);
      const next = rows.length > query.limit ? (page.at(-1)?.id ?? null) : null;
      const reader = dispositionReaderOf(principal, ability);
      return { data: await proposalViews(tx, reader, page, at), next_cursor: next };
    });
  }

  async get(
    principal: Principal,
    ability: AppAbility,
    id: string,
  ): Promise<DispositionProposalDetail> {
    const at = this.clock.now();
    return this.database.withTenant(principal, async (tx) => {
      const proposal = await findProposal(tx, id);
      const reader = dispositionReaderOf(principal, ability);
      const [view] = await proposalViews(tx, reader, [proposal], at);
      if (view === undefined) throw dispositionNotFound();
      return { ...view, items: await itemViews(tx, proposal.id) };
    });
  }

  /** «Generar la propuesta del mes»: la misma que crea el worker cada día. */
  async propose(principal: Principal, meta: RequestMeta): Promise<ProposeDispositionsResponse> {
    const actor = actorOf(principal, meta, this.clock.now());
    const outcome = await this.database.withTenant(principal, (tx) => proposeForTenant(tx, actor));
    return { proposal_id: outcome.proposalId, created: outcome.created };
  }

  /** Conservar un documento (con su motivo) o volver a eliminarlo, mientras Calidad revisa. */
  async decideItem(
    request: Request,
    target: { readonly proposalId: string; readonly itemId: string; readonly version: number },
    input: DispositionItemDecision,
  ): Promise<void> {
    const actor = actorOf(request.principal, request.meta, this.clock.now());
    await this.database.withTenant(request.principal, async (tx) => {
      const proposal = await findProposal(tx, target.proposalId);
      const item = await tx.docDisposition.findFirst({
        where: { id: target.itemId, proposalId: proposal.id, deletedAt: null },
        include: { document: { select: { code: true } } },
      });
      if (item === null) throw dispositionNotFound();
      if (proposal.status !== 'review') throw dispositionNotEditable();
      if (item.version !== target.version) throw versionConflict();
      await tx.docDisposition.update({
        where: { id: item.id },
        data: { action: input.action, keepReason: input.keep_reason },
      });
      await auditDoc(tx, actor, {
        action: 'doc.disposition.item',
        entityType: 'doc_disposition',
        entityId: item.id,
        changes: {
          proposal: proposal.code,
          document: item.document.code,
          from: item.action,
          to: input.action,
          keep_reason: input.keep_reason,
        },
      });
    });
  }

  /** Calidad envía la propuesta revisada a aprobación. */
  async send(request: Request, target: Target, input: DispositionStepRequest): Promise<void> {
    const { principal, ability, meta } = request;
    const actor = actorOf(principal, meta, this.clock.now());
    await this.database.withTenant(principal, async (tx) => {
      const proposal = await findProposal(tx, target.id);
      if (proposal.version !== target.version) throw versionConflict();
      const taskActor = await taskActorOf(tx, principal, ability, actor.at);
      await requestTransition(tx, actor, {
        instanceId: proposal.workflowInstanceId ?? '',
        action: 'send',
        comment: input.comment,
        facts: {},
        actor: taskActor,
        hasPermission: (code) => hasPermission(ability, code),
      });
    });
  }

  /** Aprobar o rechazar: el motor valida el paso y la propuesta lo sigue. */
  async decide(
    request: Request,
    target: Target,
    decision: DispositionDecision,
    input: DispositionStepRequest,
  ): Promise<void> {
    const { principal, ability, meta } = request;
    const actor = actorOf(principal, meta, this.clock.now());
    await this.database.withTenant(principal, async (tx) => {
      const proposal = await findProposal(tx, target.id);
      if (proposal.version !== target.version) throw versionConflict();
      const taskActor = await taskActorOf(tx, principal, ability, actor.at);
      await decideAsParticipant(tx, actor, {
        instanceId: proposal.workflowInstanceId ?? '',
        actor: taskActor,
        decision: decision === 'approve' ? 'approved' : 'rejected',
        comment: input.comment,
      });
    });
  }

  /** Enlace de descarga del acta, después de verificar su huella. */
  async certificateLink(
    principal: Principal,
    id: string,
    meta: RequestMeta,
  ): Promise<DownloadLinkResponse> {
    const resolved = await this.database.withTenant(principal, (tx) => readyCertificate(tx, id));
    const content = await this.storage.read(resolved.file.storageKey);
    if (createHash('sha256').update(content).digest('hex') !== resolved.file.sha256) {
      await this.reportTampering(principal, resolved, meta);
      throw integrityFailed();
    }
    const actor = actorOf(principal, meta, this.clock.now());
    return this.database.withTenant(principal, async (tx) => {
      const current = await readyCertificate(tx, id);
      const link = await this.issuer.issue(principal, 'download', current.file.id);
      await auditDoc(tx, actor, {
        action: 'doc.disposition.download_link',
        entityType: 'doc_disposition_proposal',
        entityId: current.proposal.id,
        changes: { code: current.proposal.code, expires_at: link.expires_at },
      });
      return link;
    });
  }

  private async reportTampering(
    principal: Principal,
    resolved: { proposal: DocDispositionProposal; file: File },
    meta: RequestMeta,
  ): Promise<void> {
    await this.database.withTenant(principal, (tx) =>
      recordSecurityEvent(tx, {
        tenantId: principal.tenantId,
        occurredAt: this.clock.now(),
        type: 'doc.file.integrity_failed',
        userId: principal.userId,
        severity: 'high',
        detail: {
          file_id: resolved.file.id,
          disposition_id: resolved.proposal.id,
          code: resolved.proposal.code,
        },
        meta,
      }),
    );
  }
}

import { Inject, Injectable } from '@nestjs/common';
import type {
  CancelEnvelopeRequest,
  CreateEnvelopeRequest,
  DownloadLinkResponse,
  EnvelopeDocument,
  EnvelopeListQuery,
  EnvelopeListResponse,
  EnvelopeOptions,
  EnvelopeOptionsQuery,
  RejectSignatureRequest,
} from '@arza/contracts';

import { hasPermission, type AppAbility } from '../../../platform/access/ability.js';
import type { Principal } from '../../../platform/access/principal.js';
import { CLOCK, type Clock } from '../../../platform/clock/clock.js';
import { DatabaseService } from '../../../platform/database/database.service.js';
import type { TenantTransaction } from '../../../platform/database/tenant-context.js';
import type { RequestMeta } from '../../../platform/http/request-meta.js';
import { AttachedFileLinks } from '../../doc/index.js';
import { pdfNotReady } from './contract-messages.js';
import { findVisibleContract } from './contract-records.js';
import { contractActorOf, type ContractActor } from './contract-support.js';
import { envelopeNotFound, signatureStatusInvalid } from './signature-messages.js';
import { envelopeOptions, prepareEnvelope } from './signature-preparation.js';
import { closeCompanyTask, closeEnvelope, sendEnvelope } from './signature-progress.js';
import { auditSignature, findEnvelope, type EnvelopeWithSigners } from './signature-records.js';
import { recordRejection, recordSignature } from './signature-signing.js';
import { sourceDocument } from './signature-sources.js';
import { envelopeEvents, envelopeView } from './signature-views.js';

// Firma electrónica desde la ficha del contrato (B25): preparar, enviar, seguir, anular, reenviar un
// enlace y, para la persona de la Dirección que firma por la empresa, firmar o rechazar. Quien no
// puede ver el contrato tampoco ve sus procesos de firma: para él «no existen» (numeral 15.5).

interface Requester {
  readonly principal: Principal;
  readonly ability: AppAbility;
  readonly meta: RequestMeta;
}

@Injectable()
export class SignaturesUseCase {
  constructor(
    @Inject(DatabaseService) private readonly database: DatabaseService,
    @Inject(CLOCK) private readonly clock: Clock,
    @Inject(AttachedFileLinks) private readonly links: AttachedFileLinks,
  ) {}

  private actor(requester: Requester): ContractActor {
    return contractActorOf(requester.principal, requester.meta, this.clock.now());
  }

  /** El proceso, si la persona puede ver su contrato. */
  private async visibleEnvelope(
    tx: TenantTransaction,
    ability: AppAbility,
    id: string,
  ): Promise<EnvelopeWithSigners> {
    const envelope = await findEnvelope(tx, id);
    // Las actas de los proyectos (B27) no se ven desde Contratos.
    if (envelope.contractId === null) throw envelopeNotFound();
    try {
      await findVisibleContract(tx, ability, envelope.contractId);
    } catch {
      throw envelopeNotFound();
    }
    return envelope;
  }

  async options(
    principal: Principal,
    ability: AppAbility,
    query: EnvelopeOptionsQuery,
  ): Promise<EnvelopeOptions> {
    return this.database.withTenant(principal, async (tx) => {
      const document = await sourceDocument(tx, query.source, query.source_id);
      await findVisibleContract(tx, ability, document.contract.id);
      return envelopeOptions(tx, query, this.clock.now());
    });
  }

  async list(
    principal: Principal,
    ability: AppAbility,
    query: EnvelopeListQuery,
  ): Promise<EnvelopeListResponse> {
    return this.database.withTenant(principal, async (tx) => {
      const document = await sourceDocument(tx, query.source, query.source_id);
      await findVisibleContract(tx, ability, document.contract.id);
      const rows = await tx.sigEnvelope.findMany({
        where: {
          contractId: document.contract.id,
          amendmentId: document.amendment?.id ?? null,
          deletedAt: null,
        },
        include: { signers: { where: { deletedAt: null }, orderBy: { signOrder: 'asc' } } },
        orderBy: { createdAt: 'desc' },
      });
      const viewer = {
        userId: principal.userId,
        seesEvidence: hasPermission(ability, 'signature.evidence.read'),
      };
      const items = [];
      for (const row of rows) {
        items.push(envelopeView(row, await envelopeEvents(tx, row.id), viewer));
      }
      return { items };
    });
  }

  async create(requester: Requester, input: CreateEnvelopeRequest): Promise<string> {
    const actor = this.actor(requester);
    return this.database.withTenant(requester.principal, async (tx) => {
      const document = await sourceDocument(tx, input.source, input.source_id);
      await findVisibleContract(tx, requester.ability, document.contract.id);
      return prepareEnvelope(tx, actor, input);
    });
  }

  async send(
    requester: Requester,
    target: { readonly id: string; readonly version: number; readonly key: string },
  ): Promise<void> {
    const actor = this.actor(requester);
    await this.database.withTenant(requester.principal, async (tx) => {
      await this.visibleEnvelope(tx, requester.ability, target.id);
      await sendEnvelope(tx, actor, target);
    });
  }

  async cancel(requester: Requester, id: string, input: CancelEnvelopeRequest): Promise<void> {
    const actor = this.actor(requester);
    await this.database.withTenant(requester.principal, async (tx) => {
      const envelope = await this.visibleEnvelope(tx, requester.ability, id);
      await closeEnvelope(tx, actor, envelope, { status: 'cancelled', reason: input.reason });
    });
  }

  /** Enlace nuevo para un firmante del cliente; desbloquea el código si se bloqueó. */
  async resend(requester: Requester, id: string, signerId: string): Promise<void> {
    const actor = this.actor(requester);
    await this.database.withTenant(requester.principal, async (tx) => {
      const envelope = await this.visibleEnvelope(tx, requester.ability, id);
      const signer = envelope.signers.find((candidate) => candidate.id === signerId);
      if (envelope.status !== 'sent' || signer?.kind !== 'client' || signer.status !== 'pending') {
        throw signatureStatusInvalid('Solo se reenvía el enlace a quien le toca firmar ahora.');
      }
      await tx.sigSigner.update({
        where: { id: signer.id },
        data: {
          mailPending: 'invitation',
          codeLocked: false,
          codeAttempts: 0,
          codeHash: null,
          codeExpiresAt: null,
          codeRequestedAt: null,
          codeSentAt: null,
        },
      });
      await auditSignature(tx, actor, 'signature.link.resend', envelope, {
        signer_id: signer.id,
        was_locked: signer.codeLocked,
      });
    });
  }

  /** La persona de la Dirección firma por la empresa, con su sesión y su segundo factor. */
  async signAsCompany(requester: Requester, id: string): Promise<void> {
    const actor = this.actor(requester);
    await this.database.withTenant(requester.principal, async (tx) => {
      const envelope = await this.visibleEnvelope(tx, requester.ability, id);
      const signer = companySignerOf(envelope, requester.principal.userId);
      await recordSignature(tx, actor, envelope, signer, 'session_mfa');
      await closeCompanyTask(tx, actor, envelope);
    });
  }

  async rejectAsCompany(
    requester: Requester,
    id: string,
    input: RejectSignatureRequest,
  ): Promise<void> {
    const actor = this.actor(requester);
    await this.database.withTenant(requester.principal, async (tx) => {
      const envelope = await this.visibleEnvelope(tx, requester.ability, id);
      const signer = companySignerOf(envelope, requester.principal.userId);
      await recordRejection(tx, actor, envelope, signer, input.reason);
    });
  }

  /** Enlace de descarga del PDF enviado, del firmado o del certificado de evidencia. */
  async documentLink(
    requester: Requester,
    id: string,
    document: EnvelopeDocument,
  ): Promise<DownloadLinkResponse> {
    return this.database.withTenant(requester.principal, async (tx) => {
      const envelope = await this.visibleEnvelope(tx, requester.ability, id);
      const fileId =
        document === 'original'
          ? envelope.documentFileId
          : document === 'signed'
            ? envelope.signedFileId
            : envelope.evidenceFileId;
      if (fileId === null) throw pdfNotReady();
      return this.links.issue(tx, requester.principal, fileId, requester.meta);
    });
  }
}

/** Solo firma por la empresa la persona elegida al preparar el proceso. */
function companySignerOf(envelope: EnvelopeWithSigners, userId: string) {
  const signer = envelope.signers.find(
    (candidate) => candidate.kind === 'company' && candidate.userId === userId,
  );
  if (signer === undefined) {
    throw signatureStatusInvalid('Por la empresa firma la persona elegida al preparar el envío.');
  }
  return signer;
}

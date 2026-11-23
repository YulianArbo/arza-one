import { Inject, Injectable } from '@nestjs/common';
import {
  privacyRequestKindSchema,
  privacyRequestStatusSchema,
  privacyRightSchema,
  type PortalPrivacyRequest,
  type PrivacyRequestReceipt,
  type PrivacyRequestSummary,
  type PublicPrivacyRequest,
  type PublicPrivacyStatus,
  type PublicPrivacyStatusRequest,
} from '@arza/contracts';

import type { PrivacyRequest } from '../../../generated/prisma/client.js';
import type { Principal } from '../../../platform/access/principal.js';
import { CLOCK, type Clock } from '../../../platform/clock/clock.js';
import { CONFIG } from '../../../platform/config/config.module.js';
import type { Env } from '../../../platform/config/env-schema.js';
import { DatabaseService } from '../../../platform/database/database.service.js';
import type { TenantTransaction } from '../../../platform/database/tenant-context.js';
import type { RequestMeta } from '../../../platform/http/request-meta.js';
import { bogotaToday, tenantIdByTaxId, toCalendarDate } from '../../core/index.js';
import { portalAccountOf } from '../../iam/index.js';
import { publishedNotices } from './consent-grant.js';
import { PARTY_DIRECTORY, type PartyDirectory } from './party-directory.js';
import { actorOf, auditPrivacy, privacySystemActor, type PrivacyActor } from './privacy-support.js';
import { fileRequest } from './request-intake.js';
import { requestNotFound, requestUnavailable } from './request-messages.js';
import { requestSummaries } from './request-views.js';

// Solicitudes que el titular presenta él mismo (B42, decisión 1): en el sitio público, sin sesión,
// y en el portal del cliente con su cuenta. Recibe en pantalla el código y la fecha límite, y la
// constancia por correo. La consulta de estado pide el código y el correo con que la presentó.

function receiptOf(row: PrivacyRequest): PrivacyRequestReceipt {
  return {
    code: row.code,
    kind: privacyRequestKindSchema.parse(row.kind),
    received_at: row.receivedAt.toISOString(),
    due_on: toCalendarDate(row.dueOn ?? row.receivedAt),
  };
}

async function policyNoticeId(tx: TenantTransaction): Promise<string | null> {
  const [policy] = await publishedNotices(tx, ['privacy_policy']);
  return policy?.id ?? null;
}

function publicStatusOf(row: PrivacyRequest): PublicPrivacyStatus {
  const responded = row.status === 'responded' || row.status === 'closed';
  return {
    code: row.code,
    right: privacyRightSchema.parse(row.right),
    kind: privacyRequestKindSchema.parse(row.kind),
    status: privacyRequestStatusSchema.parse(row.status),
    received_at: row.receivedAt.toISOString(),
    due_on: row.dueOn === null ? null : toCalendarDate(row.dueOn),
    requirement: row.requirementAnsweredAt === null ? row.requirementText : null,
    responded_at: row.respondedAt?.toISOString() ?? null,
    response: responded ? row.response : null,
  };
}

@Injectable()
export class PublicRequestsUseCase {
  constructor(
    @Inject(DatabaseService) private readonly database: DatabaseService,
    @Inject(CLOCK) private readonly clock: Clock,
    @Inject(CONFIG) private readonly config: Env,
    @Inject(PARTY_DIRECTORY) private readonly parties: PartyDirectory,
  ) {}

  /** La empresa del sitio público; sin ella el formulario no está disponible. */
  private async siteActor(meta: RequestMeta): Promise<PrivacyActor> {
    const taxId = this.config.PUBLIC_SITE_TAX_ID;
    if (taxId === undefined) throw requestUnavailable();
    const tenantId = await this.database.withoutTenant((tx) => tenantIdByTaxId(tx, taxId));
    if (tenantId === null) throw requestUnavailable();
    return privacySystemActor(tenantId, this.clock.now(), meta);
  }

  async filePublic(input: PublicPrivacyRequest, meta: RequestMeta): Promise<PrivacyRequestReceipt> {
    const actor = await this.siteActor(meta);
    return this.database.withTenant(actor, async (tx) => {
      const row = await fileRequest(tx, actor, {
        channel: 'web',
        right: input.right,
        name: input.name,
        email: input.email,
        phone: input.phone,
        documentNumber: input.document_number,
        description: input.description,
        receivedOn: bogotaToday(actor.at),
        partyId: null,
        portalUserId: null,
        sourceCode: null,
        privacyNoticeId: await policyNoticeId(tx),
      });
      return receiptOf(row);
    });
  }

  /** Sin coincidencia exacta de código y correo, «no existe». Queda constancia de la consulta. */
  async publicStatus(
    input: PublicPrivacyStatusRequest,
    meta: RequestMeta,
  ): Promise<PublicPrivacyStatus> {
    const actor = await this.siteActor(meta);
    return this.database.withTenant(actor, async (tx) => {
      const row = await tx.privacyRequest.findFirst({
        where: { code: input.code, requesterEmail: input.email, deletedAt: null },
      });
      if (row === null) throw requestNotFound();
      await auditPrivacy(tx, actor, {
        action: 'privacy.request.consult',
        entityType: 'prv_request',
        entityId: row.id,
        changes: { code: row.code, status: row.status },
      });
      return publicStatusOf(row);
    });
  }

  /** Desde el portal: el nombre, el correo y la ficha los pone la cuenta del cliente. */
  async filePortal(
    principal: Principal,
    input: PortalPrivacyRequest,
    meta: RequestMeta,
  ): Promise<PrivacyRequestReceipt> {
    const actor = actorOf(principal, meta, this.clock.now());
    return this.database.withTenant(principal, async (tx) => {
      const account = await portalAccountOf(tx, principal.userId);
      if (account === null) throw requestUnavailable();
      const row = await fileRequest(tx, actor, {
        channel: 'portal',
        right: input.right,
        name: account.displayName ?? account.email,
        email: account.email,
        phone: null,
        documentNumber: input.document_number,
        description: input.description,
        receivedOn: bogotaToday(actor.at),
        partyId: account.partyId,
        portalUserId: principal.userId,
        sourceCode: null,
        privacyNoticeId: await policyNoticeId(tx),
      });
      return receiptOf(row);
    });
  }

  /** Las solicitudes que la persona presentó desde el portal. */
  async mine(principal: Principal): Promise<PrivacyRequestSummary[]> {
    return this.database.withTenant(principal, async (tx) => {
      const rows = await tx.privacyRequest.findMany({
        where: { portalUserId: principal.userId, deletedAt: null },
        orderBy: { id: 'desc' },
        take: 50,
      });
      return requestSummaries(tx, this.parties, rows, this.clock.now());
    });
  }
}

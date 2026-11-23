import { Inject, Injectable } from '@nestjs/common';
import type {
  CreatePrivacyRequest,
  PrivacyRequest as PrivacyRequestView,
  PrivacyRequestListQuery,
  PrivacyRequestListResponse,
} from '@arza/contracts';

import type { Prisma } from '../../../generated/prisma/client.js';
import type { Principal } from '../../../platform/access/principal.js';
import { CLOCK, type Clock } from '../../../platform/clock/clock.js';
import { DatabaseService } from '../../../platform/database/database.service.js';
import type { RequestMeta } from '../../../platform/http/request-meta.js';
import { bogotaToday } from '../../core/index.js';
import { PARTY_DIRECTORY, type PartyDirectory } from './party-directory.js';
import { actorOf } from './privacy-support.js';
import { fileRequest } from './request-intake.js';
import { requestDateInvalid, requestNotFound } from './request-messages.js';
import { requestDetail, requestSummaries } from './request-views.js';

// Solicitudes de titulares para el Oficial de Protección de Datos (B42): la bandeja, el detalle con
// su historia y el registro de lo que llega por correo, teléfono, en persona o por escrito.

function filterOf(query: PrivacyRequestListQuery): Prisma.PrivacyRequestWhereInput {
  return {
    deletedAt: null,
    ...(query.status === undefined ? {} : { status: query.status }),
    ...(query.kind === undefined ? {} : { kind: query.kind }),
    ...(query.party_id === undefined ? {} : { partyId: query.party_id }),
    ...(query.cursor === undefined ? {} : { id: { lt: query.cursor } }),
  };
}

@Injectable()
export class RequestsUseCase {
  constructor(
    @Inject(DatabaseService) private readonly database: DatabaseService,
    @Inject(CLOCK) private readonly clock: Clock,
    @Inject(PARTY_DIRECTORY) private readonly parties: PartyDirectory,
  ) {}

  async list(
    principal: Principal,
    query: PrivacyRequestListQuery,
  ): Promise<PrivacyRequestListResponse> {
    return this.database.withTenant(principal, async (tx) => {
      const rows = await tx.privacyRequest.findMany({
        where: filterOf(query),
        orderBy: { id: 'desc' },
        take: query.limit + 1,
      });
      const page = rows.slice(0, query.limit);
      const last = page.at(-1);
      return {
        data: await requestSummaries(tx, this.parties, page, this.clock.now()),
        next_cursor: rows.length > query.limit && last !== undefined ? last.id : null,
      };
    });
  }

  async get(principal: Principal, id: string): Promise<PrivacyRequestView> {
    return this.database.withTenant(principal, async (tx) => {
      const row = await tx.privacyRequest.findFirst({
        where: { id, deletedAt: null },
        include: {
          events: { where: { deletedAt: null }, orderBy: { occurredAt: 'asc' } },
          exports: { where: { deletedAt: null }, orderBy: { requestedAt: 'desc' } },
        },
      });
      if (row === null) throw requestNotFound();
      return requestDetail(tx, this.parties, row, this.clock.now());
    });
  }

  /** Lo que llega por correo, teléfono, en persona o por escrito lo registra el Oficial. */
  async create(
    principal: Principal,
    input: CreatePrivacyRequest,
    meta: RequestMeta,
  ): Promise<string> {
    const actor = actorOf(principal, meta, this.clock.now());
    if (input.received_on > bogotaToday(actor.at)) throw requestDateInvalid();
    return this.database.withTenant(principal, async (tx) => {
      const row = await fileRequest(tx, actor, {
        channel: input.channel,
        right: input.right,
        name: input.requester_name,
        email: input.requester_email,
        phone: input.requester_phone,
        documentNumber: input.document_number,
        description: input.description,
        receivedOn: input.received_on,
        partyId: null,
        portalUserId: null,
        sourceCode: null,
        privacyNoticeId: null,
      });
      return row.id;
    });
  }
}

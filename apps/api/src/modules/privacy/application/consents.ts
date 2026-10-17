import { Inject, Injectable } from '@nestjs/common';
import {
  consentSourceSchema,
  type Consent,
  type ConsentListQuery,
  type ConsentListResponse,
  type RevokeConsentRequest,
} from '@arza/contracts';

import type { Prisma, PrivacyConsent, PrivacyNotice } from '../../../generated/prisma/client.js';
import { hasUnconditionalPermission, type AppAbility } from '../../../platform/access/ability.js';
import type { Principal } from '../../../platform/access/principal.js';
import { CLOCK, type Clock } from '../../../platform/clock/clock.js';
import { DatabaseService } from '../../../platform/database/database.service.js';
import type { TenantTransaction } from '../../../platform/database/tenant-context.js';
import type { RequestMeta } from '../../../platform/http/request-meta.js';
import { peopleById } from '../../iam/index.js';
import { partyConsentView } from './consent-grant.js';
import { PARTY_DIRECTORY, type PartyDirectory } from './party-directory.js';
import { consentNotFound, consentRevoked } from './privacy-messages.js';
import { actorOf, auditPrivacy, partyNames } from './privacy-support.js';

// Registro de autorizaciones para el Oficial de Protección de Datos (ficha 17.19): consulta con su
// evidencia y revocatoria. Con «solo lo propio» (colaborador, letra P) se ven las que la persona
// registró.

type ConsentRow = PrivacyConsent & { notice: PrivacyNotice };

function scopeOf(principal: Principal, ability: AppAbility): Prisma.PrivacyConsentWhereInput {
  return hasUnconditionalPermission(ability, 'privacy.consent.read')
    ? { deletedAt: null }
    : { deletedAt: null, createdBy: principal.userId };
}

function filterOf(query: ConsentListQuery): Prisma.PrivacyConsentWhereInput {
  return {
    ...(query.party_id === undefined ? {} : { partyId: query.party_id }),
    ...(query.status === undefined
      ? {}
      : { revokedAt: query.status === 'active' ? null : { not: null } }),
    ...(query.notice_key === undefined ? {} : { notice: { key: query.notice_key } }),
    ...(query.cursor === undefined ? {} : { id: { lt: query.cursor } }),
  };
}

@Injectable()
export class ConsentsUseCase {
  constructor(
    @Inject(DatabaseService) private readonly database: DatabaseService,
    @Inject(CLOCK) private readonly clock: Clock,
    @Inject(PARTY_DIRECTORY) private readonly parties: PartyDirectory,
  ) {}

  async list(
    principal: Principal,
    ability: AppAbility,
    query: ConsentListQuery,
  ): Promise<ConsentListResponse> {
    return this.database.withTenant(principal, async (tx) => {
      const rows = await tx.privacyConsent.findMany({
        where: { AND: [scopeOf(principal, ability), filterOf(query)] },
        include: { notice: true },
        orderBy: { id: 'desc' },
        take: query.limit + 1,
      });
      const page = rows.slice(0, query.limit);
      const last = page.at(-1);
      return {
        data: page.map(await this.viewer(tx, page)),
        next_cursor: rows.length > query.limit && last !== undefined ? last.id : null,
      };
    });
  }

  async get(principal: Principal, ability: AppAbility, id: string): Promise<Consent> {
    return this.database.withTenant(principal, async (tx) => {
      const row = await this.find(tx, scopeOf(principal, ability), id);
      return (await this.viewer(tx, [row]))(row);
    });
  }

  /** Revoca la autorización una sola vez, con su motivo. */
  async revoke(
    principal: Principal,
    id: string,
    input: RevokeConsentRequest,
    meta: RequestMeta,
  ): Promise<Consent> {
    const actor = actorOf(principal, meta, this.clock.now());
    return this.database.withTenant(principal, async (tx) => {
      const before = await this.find(tx, { deletedAt: null }, id);
      if (before.revokedAt !== null) throw consentRevoked();
      const after = await tx.privacyConsent.update({
        where: { id },
        data: { revokedAt: actor.at, revokedBy: principal.userId, revocationReason: input.reason },
        include: { notice: true },
      });
      await auditPrivacy(tx, actor, {
        action: 'privacy.consent.revoke',
        entityType: 'prv_consent',
        entityId: id,
        changes: { party_id: before.partyId, reason: input.reason },
      });
      return (await this.viewer(tx, [after]))(after);
    });
  }

  private async find(
    tx: TenantTransaction,
    scope: Prisma.PrivacyConsentWhereInput,
    id: string,
  ): Promise<ConsentRow> {
    const row = await tx.privacyConsent.findFirst({
      where: { AND: [scope, { id }] },
      include: { notice: true },
    });
    if (row === null) throw consentNotFound();
    return row;
  }

  /** Arma la vista de cada autorización con los nombres de titulares y personas de `rows`. */
  private async viewer(
    tx: TenantTransaction,
    rows: readonly ConsentRow[],
  ): Promise<(row: ConsentRow) => Consent> {
    const nameOf = await partyNames(
      tx,
      this.parties,
      rows.map((row) => row.partyId),
    );
    const people = await peopleById(
      tx,
      rows.flatMap((row) => (row.createdBy === null ? [] : [row.createdBy])),
    );
    return (row) => ({
      ...partyConsentView(row),
      party: { id: row.partyId, name: nameOf(row.partyId) },
      source: consentSourceSchema.parse(row.source),
      evidence: {
        recorded_by:
          row.createdBy === null ? null : (people.get(row.createdBy)?.displayName ?? null),
        recorded_at: row.createdAt.toISOString(),
        ip_address: row.ipAddress,
        user_agent: row.userAgent,
        file_id: row.evidenceFileId,
      },
      revocation_reason: row.revocationReason,
    });
  }
}

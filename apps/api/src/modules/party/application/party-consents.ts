import { Inject, Injectable } from '@nestjs/common';
import type { ConsentGrant, Notice } from '@arza/contracts';

import type { Principal } from '../../../platform/access/principal.js';
import { CLOCK, type Clock } from '../../../platform/clock/clock.js';
import { DatabaseService } from '../../../platform/database/database.service.js';
import type { TenantTransaction } from '../../../platform/database/tenant-context.js';
import type { RequestMeta } from '../../../platform/http/request-meta.js';
import {
  actorOf,
  grantConsent,
  publishedAuthorizationNotices,
  type PartyDirectory,
  type PartyRecord,
} from '../../privacy/index.js';
import { consentNotAllowed } from './party-messages.js';
import { ALL_PARTIES, findParty, partyName } from './party-support.js';

// Autorizaciones de tratamiento desde la ficha del tercero (B17). El texto y el registro son de
// privacidad; aquí solo se decide quién puede pedirlos: quien ve o edita terceros.

/** Terceros para privacidad (puerto PARTY_DIRECTORY): también los retirados y fusionados. */
async function describeParties(
  tx: TenantTransaction,
  ids: readonly string[],
): Promise<Map<string, PartyRecord>> {
  if (ids.length === 0) return new Map();
  const rows = await tx.party.findMany({ where: { id: { in: [...ids] } } });
  return new Map(
    rows.map((row) => [
      row.id,
      {
        id: row.id,
        name: partyName(row),
        kind: row.kind === 'person' ? 'person' : 'organization',
        isCurrent: row.deletedAt === null,
      },
    ]),
  );
}

export const PARTY_RECORDS: PartyDirectory = { describe: describeParties };

@Injectable()
export class PartyConsentsUseCase {
  constructor(
    @Inject(DatabaseService) private readonly database: DatabaseService,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  /** Textos de autorización vigentes, para el formulario. */
  async notices(principal: Principal): Promise<Notice[]> {
    return this.database.withTenant(principal, publishedAuthorizationNotices);
  }

  /** Autorización nueva de una persona ya registrada, por ejemplo para otra finalidad. */
  async grant(
    principal: Principal,
    partyId: string,
    grant: ConsentGrant,
    meta: RequestMeta,
  ): Promise<string> {
    const actor = actorOf(principal, meta, this.clock.now());
    return this.database.withTenant(principal, async (tx) => {
      const party = await findParty(tx, ALL_PARTIES, partyId);
      if (party.kind !== 'person') throw consentNotAllowed();
      return grantConsent(tx, actor, { partyId, grant, source: 'party_consent' });
    });
  }
}

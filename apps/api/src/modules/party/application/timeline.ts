import { Inject, Injectable } from '@nestjs/common';
import type { TimelineQuery, TimelineResponse } from '@arza/contracts';

import { hasPermission, type AppAbility } from '../../../platform/access/ability.js';
import type { Principal } from '../../../platform/access/principal.js';
import { DatabaseService } from '../../../platform/database/database.service.js';
import type { TenantTransaction } from '../../../platform/database/tenant-context.js';
import { entityHistory } from '../../audit/index.js';
import { findParty, scopeOf } from './party-support.js';

// Línea de tiempo del tercero (ficha 17.3): todo lo ocurrido con él, sus contactos, cuentas y
// conocimiento, incluido lo de los duplicados que se le fusionaron. Solo lo que el rol puede ver:
// los movimientos de las cuentas bancarias, solo con permiso para verlas.

/** Registros cuyo historial se muestra. */
async function relatedIds(
  tx: TenantTransaction,
  partyId: string,
  withBankAccounts: boolean,
): Promise<string[]> {
  const merged = await tx.party.findMany({
    where: { mergedIntoId: partyId },
    select: { id: true },
  });
  const parties = [partyId, ...merged.map((row) => row.id)];
  const [contacts, reviews, accounts] = await Promise.all([
    tx.contact.findMany({
      where: { OR: [{ organizationId: { in: parties } }, { personId: { in: parties } }] },
      select: { id: true },
    }),
    tx.dueDiligence.findMany({ where: { partyId: { in: parties } }, select: { id: true } }),
    withBankAccounts
      ? tx.bankAccount.findMany({ where: { partyId: { in: parties } }, select: { id: true } })
      : Promise.resolve([]),
  ]);
  return [...parties, ...[...contacts, ...reviews, ...accounts].map((row) => row.id)];
}

@Injectable()
export class TimelineUseCase {
  constructor(@Inject(DatabaseService) private readonly database: DatabaseService) {}

  async timeline(
    principal: Principal,
    ability: AppAbility,
    partyId: string,
    query: TimelineQuery,
  ): Promise<TimelineResponse> {
    return this.database.withTenant(principal, async (tx) => {
      await findParty(tx, scopeOf(principal, ability), partyId);
      const withBankAccounts = hasPermission(ability, 'party.bank_account.read');
      const ids = await relatedIds(tx, partyId, withBankAccounts);
      const { events, nextCursor } = await entityHistory(tx, ids, query);
      return {
        data: events.map((event) => ({
          id: event.id,
          occurred_at: event.occurred_at,
          actor_name: event.actor.display_name ?? event.actor.email,
          action: event.action,
          entity_type: event.entity_type,
          changes: event.changes,
        })),
        next_cursor: nextCursor,
      };
    });
  }
}

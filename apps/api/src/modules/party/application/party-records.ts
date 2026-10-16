import type { AppAbility } from '../../../platform/access/ability.js';
import type { Principal } from '../../../platform/access/principal.js';
import type { TenantTransaction } from '../../../platform/database/tenant-context.js';
import { partyName, scopeOf, visibleParties } from './party-support.js';

/**
 * Nombre del tercero si la persona puede verlo; si no, null (para ella «no existe»). Lo usan los
 * comentarios y adjuntos (B16), que exigen ver el registro.
 */
export async function visiblePartyName(
  tx: TenantTransaction,
  principal: Principal,
  ability: AppAbility,
  partyId: string,
): Promise<string | null> {
  const party = await tx.party.findFirst({
    where: { id: partyId, ...visibleParties(scopeOf(principal, ability)) },
  });
  return party === null ? null : partyName(party);
}

import type { AppAbility } from '../../../platform/access/ability.js';
import type { TenantTransaction } from '../../../platform/database/tenant-context.js';
import { canSeeContract } from './contract-records.js';

// Para los comentarios y los anexos del expediente contractual (B16, B24): cómo se nombra un
// contrato que la persona puede ver. Si no lo ve, para ella no existe (numeral 15.5).

export async function visibleContractTitle(
  tx: TenantTransaction,
  ability: AppAbility,
  id: string,
): Promise<string | null> {
  const contract = await tx.ctrContract.findFirst({ where: { id, deletedAt: null } });
  if (contract === null || !canSeeContract(ability, contract)) return null;
  return `${contract.code}: ${contract.title}`;
}

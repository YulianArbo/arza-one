import { contractStatusSchema, type ContractStatus } from '@arza/contracts';

import type { CtrContract, Prisma } from '../../../generated/prisma/client.js';
import {
  canOnRecord,
  hasUnconditionalPermission,
  type AppAbility,
} from '../../../platform/access/ability.js';
import type { Principal } from '../../../platform/access/principal.js';
import type { TenantTransaction } from '../../../platform/database/tenant-context.js';
import { versionConflict } from '../../../platform/http/if-match.js';
import { toCalendarDate } from '../../core/index.js';
import { contractNotFound, statusInvalid } from './contract-messages.js';

// Lectura y escritura de un contrato con su versión (B24), comunes a los casos de uso. Quien solo ve
// «lo propio» (Talento humano, Colaborador) ve los contratos de los que es responsable o autor; para
// los demás, un contrato ajeno «no existe» (numeral 15.5).

export const CONTRACT_SEQUENCE = 'ctr.contract';
export const SERVICE_ORDER_SEQUENCE = 'ctr.service_order';
export const CONTRACTS = { name: 'Contratos', prefix: 'CTR', padding: 4 } as const;
export const SERVICE_ORDERS = { name: 'Órdenes de servicio', prefix: 'OS', padding: 4 } as const;

export async function findContract(tx: TenantTransaction, id: string): Promise<CtrContract> {
  const contract = await tx.ctrContract.findFirst({ where: { id, deletedAt: null } });
  if (contract === null) throw contractNotFound('El contrato');
  return contract;
}

function involved(contract: Pick<CtrContract, 'responsibleId' | 'createdBy'>): string[] {
  return [contract.responsibleId, contract.createdBy].filter((id): id is string => id !== null);
}

/** La persona puede ver el contrato: lo ve todo o es su responsable o su autor. */
export function canSeeContract(
  ability: AppAbility,
  contract: Pick<CtrContract, 'responsibleId' | 'createdBy'>,
): boolean {
  return canOnRecord(ability, 'contract.read', { involved_user_ids: involved(contract) });
}

/** El contrato, si la persona puede verlo; si no, «no existe». */
export async function findVisibleContract(
  tx: TenantTransaction,
  ability: AppAbility,
  id: string,
): Promise<CtrContract> {
  const contract = await findContract(tx, id);
  if (!canSeeContract(ability, contract)) throw contractNotFound('El contrato');
  return contract;
}

/** Filtro de la lista: todos, o solo los propios si la persona solo ve lo propio. */
export function visibleContracts(
  principal: Principal,
  ability: AppAbility,
): Prisma.CtrContractWhereInput {
  if (hasUnconditionalPermission(ability, 'contract.read')) return {};
  return { OR: [{ responsibleId: principal.userId }, { createdBy: principal.userId }] };
}

export function statusOf(contract: Pick<CtrContract, 'status'>): ContractStatus {
  return contractStatusSchema.parse(contract.status);
}

/** El contrato está en uno de los estados que permiten el paso. */
export function assertContractStatus(
  contract: Pick<CtrContract, 'status'>,
  allowed: readonly ContractStatus[],
  detail: string,
): void {
  if (!allowed.includes(statusOf(contract))) throw statusInvalid(detail);
}

export async function updateContractVersioned(
  tx: TenantTransaction,
  target: { readonly id: string; readonly version: number },
  data: Prisma.CtrContractUncheckedUpdateManyInput,
): Promise<void> {
  const { count } = await tx.ctrContract.updateMany({
    where: { id: target.id, version: target.version, deletedAt: null },
    data,
  });
  if (count === 0) throw versionConflict();
}

/** Lo que guarda la auditoría del contrato. */
export function contractAudit(contract: CtrContract): Record<string, string | null> {
  return {
    code: contract.code,
    status: contract.status,
    title: contract.title,
    value: contract.value === null ? null : contract.value.toFixed(2),
    starts_on: toCalendarDate(contract.startsOn),
    ends_on: toCalendarDate(contract.endsOn),
  };
}

/** Datos del evento para avisar al autor y al responsable: nunca datos personales. */
export function contractEventPayload(contract: CtrContract): Prisma.InputJsonObject {
  return {
    code: contract.code,
    author_id: contract.createdBy,
    responsible_id: contract.responsibleId,
  };
}

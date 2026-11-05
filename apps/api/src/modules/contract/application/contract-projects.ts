import { IN_FORCE_STATUSES, type ContractStatus } from '@arza/contracts';

import type { CtrContract } from '../../../generated/prisma/client.js';
import type { TenantTransaction } from '../../../platform/database/tenant-context.js';
import { toCalendarDate } from '../../core/index.js';
import { statusOf } from './contract-records.js';

// El contrato como lo usa Proyectos (B26, ficha 17.8): el cliente, las fechas, el valor y el estado,
// para crear el proyecto desde un contrato vigente y saber si el proyecto ya puede iniciar.

export interface ProjectContract {
  readonly id: string;
  readonly code: string;
  readonly title: string;
  readonly partyId: string;
  readonly status: ContractStatus;
  readonly startsOn: string;
  readonly endsOn: string;
  /** Pesos con dos decimales; null en un acuerdo de confidencialidad. */
  readonly value: string | null;
}

function projectContractOf(contract: CtrContract): ProjectContract {
  return {
    id: contract.id,
    code: contract.code,
    title: contract.title,
    partyId: contract.partyId,
    status: statusOf(contract),
    startsOn: toCalendarDate(contract.startsOn),
    endsOn: toCalendarDate(contract.endsOn),
    value: contract.value === null ? null : contract.value.toFixed(2),
  };
}

/** Contratos y órdenes de servicio (no acuerdos de confidencialidad), por identificador. */
export async function contractsForProjects(
  tx: TenantTransaction,
  ids: readonly string[],
): Promise<Map<string, ProjectContract>> {
  if (ids.length === 0) return new Map();
  const rows = await tx.ctrContract.findMany({
    where: { id: { in: [...new Set(ids)] }, kind: { not: 'nda' }, deletedAt: null },
  });
  return new Map(rows.map((row) => [row.id, projectContractOf(row)]));
}

/** Los contratos que rigen hoy, los más recientes primero: de ellos nace un proyecto. */
export async function contractsInForce(tx: TenantTransaction): Promise<ProjectContract[]> {
  const rows = await tx.ctrContract.findMany({
    where: { status: { in: [...IN_FORCE_STATUSES] }, kind: { not: 'nda' }, deletedAt: null },
    orderBy: [{ startsOn: 'desc' }, { id: 'desc' }],
    take: 200,
  });
  return rows.map(projectContractOf);
}

/** El contrato rige: el proyecto puede iniciar sin la autorización de la Dirección. */
export function isInForce(contract: Pick<ProjectContract, 'status'>): boolean {
  return IN_FORCE_STATUSES.includes(contract.status);
}

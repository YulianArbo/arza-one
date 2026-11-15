import type { TenantTransaction } from '../../../platform/database/tenant-context.js';
import { partyName } from './party-support.js';

// Lo que Finanzas (B32) pide a Terceros: los proveedores para registrar un gasto y el documento de
// cada tercero para el archivo contable. Nunca lee pty_ directamente.

export interface FinanceParty {
  readonly id: string;
  readonly name: string;
  /** Número del documento con dígito de verificación, como 900123456-7; null si no lo tiene. */
  readonly taxId: string | null;
}

/** Proveedores vigentes (papel «supplier» activo), para elegir en un gasto. */
export async function activeSuppliers(tx: TenantTransaction): Promise<FinanceParty[]> {
  const rows = await tx.party.findMany({
    where: {
      deletedAt: null,
      status: { notIn: ['blocked', 'inactive'] },
      roles: { some: { role: 'supplier', status: 'active', deletedAt: null } },
    },
    orderBy: [{ legalName: 'asc' }, { lastName: 'asc' }],
  });
  return rows.map(financeView);
}

/** Terceros por identificador, también los retirados, para mostrarlos y exportarlos. */
export async function financeParties(
  tx: TenantTransaction,
  ids: readonly string[],
): Promise<Map<string, FinanceParty>> {
  if (ids.length === 0) return new Map();
  const rows = await tx.party.findMany({ where: { id: { in: [...new Set(ids)] } } });
  return new Map(rows.map((row) => [row.id, financeView(row)]));
}

function financeView(party: Parameters<typeof partyName>[0]): FinanceParty {
  const digit = party.checkDigit === null ? '' : `-${String(party.checkDigit)}`;
  return {
    id: party.id,
    name: partyName(party),
    taxId: party.idNumber === null ? null : `${party.idNumber}${digit}`,
  };
}

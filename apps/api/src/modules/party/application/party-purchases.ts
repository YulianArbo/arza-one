import type { TenantTransaction } from '../../../platform/database/tenant-context.js';
import { toCalendarDate } from '../../core/index.js';
import { activeSuppliers, financeParties } from './party-finance.js';

// Lo que Compras (B33) pide a Terceros: los proveedores con el estado de su conocimiento del
// tercero. Sin conocimiento vigente no se le emite una orden (ficha 17.12). Nunca lee pty_.

export interface PurchaseSupplier {
  readonly id: string;
  readonly name: string;
  /** Su último conocimiento del tercero está aprobado y no ha vencido. */
  readonly verified: boolean;
}

/** Terceros con conocimiento vigente ese día, entre los indicados. */
async function verifiedIds(
  tx: TenantTransaction,
  ids: readonly string[],
  today: string,
): Promise<Set<string>> {
  if (ids.length === 0) return new Set();
  const rows = await tx.dueDiligence.findMany({
    where: { partyId: { in: [...new Set(ids)] }, deletedAt: null },
    orderBy: { createdAt: 'desc' },
  });
  const latest = new Map<string, (typeof rows)[number]>();
  for (const row of rows) if (!latest.has(row.partyId)) latest.set(row.partyId, row);
  const verified = [...latest.values()].filter(
    (row) =>
      row.status === 'approved' &&
      (row.nextReviewOn === null || toCalendarDate(row.nextReviewOn) >= today),
  );
  return new Set(verified.map((row) => row.partyId));
}

/** Proveedores vigentes para cotizar y evaluar, con su verificación. */
export async function activePurchaseSuppliers(
  tx: TenantTransaction,
  today: string,
): Promise<PurchaseSupplier[]> {
  const suppliers = await activeSuppliers(tx);
  const verified = await verifiedIds(
    tx,
    suppliers.map((supplier) => supplier.id),
    today,
  );
  return suppliers.map(({ id, name }) => ({ id, name, verified: verified.has(id) }));
}

/** Proveedores por identificador, también los retirados, para mostrarlos en lo ya registrado. */
export async function purchaseSupplierRefs(
  tx: TenantTransaction,
  today: string,
  ids: readonly string[],
): Promise<Map<string, PurchaseSupplier>> {
  const [parties, verified] = await Promise.all([
    financeParties(tx, ids),
    verifiedIds(tx, ids, today),
  ]);
  return new Map(
    [...parties.values()].map(({ id, name }) => [id, { id, name, verified: verified.has(id) }]),
  );
}

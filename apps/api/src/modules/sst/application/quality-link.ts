import type { TenantTransaction } from '../../../platform/database/tenant-context.js';

// Lo que Calidad necesita de un incidente para abrir su no conformidad enlazada (B38, decisión 5):
// solo su código. Calidad nunca lee las tablas de SST.

export async function incidentRefForQuality(
  tx: TenantTransaction,
  incidentId: string,
): Promise<{ readonly id: string; readonly code: string } | null> {
  return tx.sstIncident.findFirst({
    where: { id: incidentId, deletedAt: null },
    select: { id: true, code: true },
  });
}

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

/**
 * Incidentes y accidentes ocurridos en el periodo, para el indicador automático de Calidad y la
 * revisión por la dirección (B39, decisión 6). Solo el número: nunca quién ni qué pasó.
 */
export async function incidentCountForQuality(
  tx: TenantTransaction,
  period: { readonly from: Date; readonly to: Date },
): Promise<number> {
  return tx.sstIncident.count({
    where: { occurredAt: { gte: period.from, lt: period.to }, deletedAt: null },
  });
}

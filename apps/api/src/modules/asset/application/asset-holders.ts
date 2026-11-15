import type { TenantTransaction } from '../../../platform/database/tenant-context.js';
import { toCalendarDate } from '../../core/index.js';

// Lo que otros módulos pueden preguntarle a Activos (B34). Talento humano lo usará en el retiro de
// un colaborador para listar lo que debe devolver (ficha 17.12, criterio de aceptación).

/** Un activo que la persona tiene asignado y aún no ha devuelto. */
export interface HeldAsset {
  readonly assetId: string;
  readonly code: string;
  readonly name: string;
  readonly assignedOn: string;
}

/** Activos con asignación vigente a cargo de la persona: los que debe devolver al retirarse. */
export async function assetsHeldBy(tx: TenantTransaction, userId: string): Promise<HeldAsset[]> {
  const rows = await tx.astAssignment.findMany({
    where: { userId, status: 'active', deletedAt: null },
    include: { asset: true },
    orderBy: { assignedOn: 'asc' },
  });
  return rows.map((row) => ({
    assetId: row.assetId,
    code: row.asset.code,
    name: row.asset.name,
    assignedOn: toCalendarDate(row.assignedOn),
  }));
}

import { Decimal } from 'decimal.js';

import type { TenantTransaction } from '../../../platform/database/tenant-context.js';

// Lo que Finanzas (B32) pide a Proyectos para certificar costos de desarrollo: los proyectos y las
// horas aprobadas de un proyecto en un mes. Finanzas nunca lee prj_ directamente.

/** Proyectos de la empresa, de cualquier estado, para elegir en una certificación. */
export async function certifiableProjects(
  tx: TenantTransaction,
): Promise<{ id: string; code: string; name: string }[]> {
  return tx.prjProject.findMany({
    where: { deletedAt: null },
    select: { id: true, code: true, name: true },
    orderBy: { code: 'asc' },
  });
}

/** Horas aprobadas de un proyecto entre dos fechas (ambas incluidas), con dos decimales. */
export async function approvedHours(
  tx: TenantTransaction,
  projectId: string,
  from: Date,
  to: Date,
): Promise<string> {
  const total = await tx.prjTimeEntry.aggregate({
    where: {
      projectId,
      status: 'approved',
      deletedAt: null,
      workDate: { gte: from, lte: to },
    },
    _sum: { hours: true },
  });
  return new Decimal(total._sum.hours?.toString() ?? '0').toFixed(2);
}

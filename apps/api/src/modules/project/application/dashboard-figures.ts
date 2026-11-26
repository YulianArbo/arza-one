import type { TenantTransaction } from '../../../platform/database/tenant-context.js';
import { toCalendarDate } from '../../core/index.js';
import { commercialParties } from '../../party/index.js';

// Proyectos en riesgo para el tablero gerencial (B46, decisión 2): los que su líder marcó «En
// riesgo», con el motivo que registró.

export interface ProjectRiskRow {
  readonly id: string;
  readonly code: string;
  readonly name: string;
  readonly client: string;
  readonly endsOn: string;
  readonly reason: string;
}

export async function projectsAtRisk(tx: TenantTransaction): Promise<ProjectRiskRow[]> {
  const rows = await tx.prjProject.findMany({
    where: { status: 'at_risk', deletedAt: null },
    orderBy: [{ endsOn: 'asc' }, { code: 'asc' }],
  });
  const parties = await commercialParties(tx, [...new Set(rows.map((row) => row.partyId))]);
  return rows.map((row) => ({
    id: row.id,
    code: row.code,
    name: row.name,
    client: parties.get(row.partyId)?.name ?? 'Cliente',
    endsOn: toCalendarDate(row.endsOn),
    reason: row.statusReason ?? '',
  }));
}

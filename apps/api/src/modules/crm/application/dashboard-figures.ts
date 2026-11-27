import { Decimal } from 'decimal.js';

import type { TenantTransaction } from '../../../platform/database/tenant-context.js';
import { toCalendarDate } from '../../core/index.js';
import { commercialParties } from '../../party/index.js';

// Oportunidades abiertas para el tablero gerencial (B46, decisión 2): las que no se han ganado ni
// perdido, con su valor estimado. Es el mismo filtro «abiertas» del listado de oportunidades.

const CLOSED = ['won', 'lost'];

export interface PipelineRow {
  readonly id: string;
  readonly code: string;
  readonly title: string;
  readonly client: string;
  readonly expectedClose: string;
  readonly value: string;
}

export async function openPipeline(
  tx: TenantTransaction,
): Promise<{ readonly total: string; readonly rows: readonly PipelineRow[] }> {
  const rows = await tx.crmOpportunity.findMany({
    where: { stage: { notIn: CLOSED }, deletedAt: null },
    orderBy: [{ expectedClose: 'asc' }, { code: 'asc' }],
  });
  const parties = await commercialParties(tx, [...new Set(rows.map((row) => row.partyId))]);
  const total = rows.reduce((sum, row) => sum.plus(row.estimatedValue.toString()), new Decimal(0));
  return {
    total: total.toFixed(2),
    rows: rows.map((row) => ({
      id: row.id,
      code: row.code,
      title: row.title,
      client: parties.get(row.partyId)?.name ?? 'Cliente',
      expectedClose: toCalendarDate(row.expectedClose),
      value: row.estimatedValue.toFixed(2),
    })),
  };
}

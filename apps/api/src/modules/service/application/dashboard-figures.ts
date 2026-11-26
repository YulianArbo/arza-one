import type { TenantTransaction } from '../../../platform/database/tenant-context.js';

// Satisfacción de los clientes para el tablero gerencial (B46, decisión 2): las encuestas
// respondidas en el periodo con su satisfacción (1 a 5). Sin datos de quien respondió.

export interface SatisfactionRow {
  readonly id: string;
  readonly answeredAt: string;
  readonly satisfaction: number;
  readonly score: number | null;
}

export async function satisfactionAnswers(
  tx: TenantTransaction,
  period: { readonly from: Date; readonly to: Date },
): Promise<SatisfactionRow[]> {
  const rows = await tx.svcSurveyResponse.findMany({
    where: {
      answeredAt: { gte: period.from, lt: period.to },
      satisfaction: { not: null },
      deletedAt: null,
    },
    select: { id: true, answeredAt: true, satisfaction: true, score: true },
    orderBy: [{ answeredAt: 'desc' }, { id: 'desc' }],
  });
  return rows.map((row) => ({
    id: row.id,
    answeredAt: (row.answeredAt ?? period.from).toISOString(),
    satisfaction: row.satisfaction ?? 0,
    score: row.score,
  }));
}

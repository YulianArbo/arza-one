import type { BudgetExecution, CostCenterRef } from '@arza/contracts';

import type { FinBudgetLine } from '../../../generated/prisma/client.js';
import type { TenantTransaction } from '../../../platform/database/tenant-context.js';
import { catalogLabels, costCenterRefs } from '../../core/index.js';
import { Money } from '../domain/ledger-rules.js';
import { CATEGORY_CATALOG, dateColumn } from './ledger-support.js';

// Ejecución del presupuesto (criterio de la ficha 17.11): por centro de costo y rubro, lo planeado
// del año contra lo ejecutado, que son los gastos aprobados y los vales de caja menor del año.

type Sum = InstanceType<typeof Money>;

function keyOf(costCenterId: string, category: string): string {
  return `${costCenterId}|${category}`;
}

function addTo(map: Map<string, Sum>, key: string, amount: { toString(): string }): void {
  map.set(key, (map.get(key) ?? new Money(0)).plus(amount.toString()));
}

async function executedByKey(tx: TenantTransaction, year: number): Promise<Map<string, Sum>> {
  const range = {
    gte: dateColumn(`${String(year)}-01-01`),
    lte: dateColumn(`${String(year)}-12-31`),
  };
  const [expenses, vouchers] = await Promise.all([
    tx.finExpense.groupBy({
      by: ['costCenterId', 'category'],
      where: { status: 'approved', deletedAt: null, expenseDate: range },
      _sum: { amount: true },
    }),
    tx.finPettyCash.groupBy({
      by: ['costCenterId', 'category'],
      where: { type: 'voucher', deletedAt: null, movementDate: range },
      _sum: { amount: true },
    }),
  ]);
  const executed = new Map<string, Sum>();
  for (const row of [...expenses, ...vouchers]) {
    if (row.costCenterId === null || row.category === null) continue;
    addTo(executed, keyOf(row.costCenterId, row.category), row._sum.amount ?? 0);
  }
  return executed;
}

export async function budgetExecution(
  tx: TenantTransaction,
  year: number,
  lines: readonly FinBudgetLine[],
): Promise<BudgetExecution> {
  const planned = new Map<string, Sum>();
  for (const line of lines) addTo(planned, keyOf(line.costCenterId, line.category), line.planned);
  const executed = await executedByKey(tx, year);
  const keys = [...new Set([...planned.keys(), ...executed.keys()])].sort();
  const [centers, labels] = await Promise.all([
    costCenterRefs(
      tx,
      keys.map((key) => key.split('|')[0] ?? ''),
    ),
    catalogLabels(tx, CATEGORY_CATALOG),
  ]);
  const centerOf = (id: string): CostCenterRef => {
    const center = centers.get(id);
    return { id, code: center?.code ?? '—', name: center?.name ?? 'Centro de costo' };
  };
  const rows = keys.map((key) => {
    const [centerId = '', category = ''] = key.split('|');
    return {
      cost_center: centerOf(centerId),
      category: { code: category, label: labels.get(category) ?? category },
      planned: (planned.get(key) ?? new Money(0)).toFixed(2),
      executed: (executed.get(key) ?? new Money(0)).toFixed(2),
    };
  });
  return { year, rows, by_cost_center: totalsByCenter(rows) };
}

function totalsByCenter(rows: BudgetExecution['rows']): BudgetExecution['by_cost_center'] {
  const byCenter = new Map<string, { center: CostCenterRef; planned: Sum; executed: Sum }>();
  for (const row of rows) {
    const current = byCenter.get(row.cost_center.id) ?? {
      center: row.cost_center,
      planned: new Money(0),
      executed: new Money(0),
    };
    current.planned = current.planned.plus(row.planned);
    current.executed = current.executed.plus(row.executed);
    byCenter.set(row.cost_center.id, current);
  }
  return [...byCenter.values()]
    .sort((a, b) => a.center.code.localeCompare(b.center.code))
    .map((total) => ({
      cost_center: total.center,
      planned: total.planned.toFixed(2),
      executed: total.executed.toFixed(2),
    }));
}

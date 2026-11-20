'use client';

import {
  budgetExecutionEnvelopeSchema,
  budgetListResponseSchema,
  type BudgetSummary,
} from '@arza/contracts';
import { buttonVariants, HighlightCard } from '@arza/ui';
import { Wallet } from 'lucide-react';
import Link from 'next/link';
import type { JSX } from 'react';

import { fromCents, percentOfCents, sumMoney } from '../../lib/format/money-cents';
import { QueryState } from '../administration/query-state';
import { bogotaToday, formatPesos } from '../crm/labels';
import { useLedgerQuery } from './ledger-ui';

// Ejecución presupuestal de la portada de Finanzas (B22B, boceto 11). La API la calcula por año,
// por centro de costo y rubro; aquí se suman los totales en centavos, sin coma flotante.

const BUDGET_PATH = '/app/finanzas/presupuesto';

/** Presupuesto aprobado del año en curso; si no hay, el aprobado más reciente. */
function budgetToShow(budgets: readonly BudgetSummary[], year: number): BudgetSummary | undefined {
  const approved = budgets.filter((budget) => budget.status === 'approved');
  return (
    approved.find((budget) => budget.year === year) ??
    [...approved].sort((left, right) => right.year - left.year)[0]
  );
}

function OpenBudget(): JSX.Element {
  return (
    <Link
      href={BUDGET_PATH}
      className={buttonVariants({ variant: 'outline', className: 'self-start' })}
    >
      <Wallet aria-hidden="true" />
      Abrir presupuesto
    </Link>
  );
}

interface Totals {
  readonly year: number;
  readonly planned: bigint;
  readonly executed: bigint;
}

/** Lo disponible en grande, el total presupuestado y la barra de lo ejecutado. */
function ExecutionView({ year, planned, executed }: Totals): JSX.Element {
  const percent = percentOfCents(executed, planned);
  return (
    <div className="flex flex-col gap-3">
      <p className="text-4xl font-semibold tracking-tight tabular-nums sm:text-5xl">
        {formatPesos(fromCents(planned - executed))}
      </p>
      <p className="text-muted-foreground">
        Disponible de {formatPesos(fromCents(planned))} presupuestados en {year}.
      </p>
      <div
        role="meter"
        aria-label="Presupuesto ejecutado"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={percent}
        aria-valuetext={`${String(percent)} % ejecutado`}
        className="h-3 overflow-hidden rounded-full bg-muted"
      >
        <div className="h-full rounded-full bg-primary" style={{ width: `${String(percent)}%` }} />
      </div>
      <p className="tabular-nums">
        Ejecutado {formatPesos(fromCents(executed))} ({percent} %)
      </p>
    </div>
  );
}

function ExecutionFigures({ budgetId }: { readonly budgetId: string }): JSX.Element {
  const execution = useLedgerQuery(
    `/v1/finance/budgets/${budgetId}/execution`,
    budgetExecutionEnvelopeSchema,
  );
  return (
    <QueryState query={execution} loadingLabel="Calculando la ejecución">
      {({ data }) => (
        <ExecutionView
          year={data.year}
          planned={sumMoney(data.by_cost_center.map((row) => row.planned))}
          executed={sumMoney(data.by_cost_center.map((row) => row.executed))}
        />
      )}
    </QueryState>
  );
}

/** Tarjeta destacada con lo disponible del presupuesto aprobado y cuánto se ha ejecutado. */
export function BudgetExecutionCard(): JSX.Element {
  const budgets = useLedgerQuery('/v1/finance/budgets', budgetListResponseSchema);
  const year = Number(bogotaToday().slice(0, 4));
  return (
    <HighlightCard title="Ejecución presupuestal" highlighted>
      <QueryState query={budgets} loadingLabel="Cargando el presupuesto">
        {({ data }) => {
          const budget = budgetToShow(data, year);
          return budget ? (
            <ExecutionFigures budgetId={budget.id} />
          ) : (
            <p className="text-muted-foreground">
              Todavía no hay un presupuesto aprobado. Cuando se apruebe, aquí verá cuánto queda
              disponible.
            </p>
          );
        }}
      </QueryState>
      <OpenBudget />
    </HighlightCard>
  );
}

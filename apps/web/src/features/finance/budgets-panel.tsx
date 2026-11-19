'use client';

import {
  budgetDetailEnvelopeSchema,
  budgetExecutionEnvelopeSchema,
  budgetListResponseSchema,
  createBudgetSchema,
  invoiceCreatedResponseSchema,
  type BudgetDetail,
  type BudgetSummary,
} from '@arza/contracts';
import {
  Badge,
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  EmptyState,
  SimpleTable,
} from '@arza/ui';
import { PiggyBank } from 'lucide-react';
import { useState, type JSX } from 'react';

import { PageHeader } from '../../components/app-shell/page-header';
import { useApiClient } from '../../lib/api/api-provider';
import { FormError } from '../access/form-alert';
import { SubmitButton } from '../access/submit-button';
import { QueryState } from '../administration/query-state';
import { formatPesos } from '../crm/labels';
import { RecordDialog } from '../organization/record-dialog';
import { usePermissions } from '../session/permissions';
import { BudgetLineEditor } from './budget-lines';
import {
  ActionButton,
  LedgerField,
  problemsOf,
  useLedgerAction,
  useLedgerQuery,
} from './ledger-ui';

// Presupuesto por centro de costo (B32): elaborar, aprobar y comparar con lo ejecutado.

const STATUS = { draft: 'Borrador', approved: 'Aprobado' } as const;

export function BudgetsPanel(): JSX.Element {
  const budgets = useLedgerQuery('/v1/finance/budgets', budgetListResponseSchema);
  const [selected, setSelected] = useState<string | null>(null);
  const { can } = usePermissions();
  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        title="Presupuesto"
        description="Lo planeado por centro de costo, rubro y mes, y lo ejecutado contra lo planeado."
      />
      {can('finance.budget.manage') ? <CreateBudgetDialog /> : null}
      <QueryState query={budgets} loadingLabel="Cargando presupuestos">
        {(result) =>
          result.data.length === 0 ? (
            <EmptyState
              icon={<PiggyBank />}
              title="Aún no hay presupuestos"
              description="Cree el presupuesto del año para planear por centro de costo."
            />
          ) : (
            <BudgetList budgets={result.data} onSelect={setSelected} />
          )
        }
      </QueryState>
      {selected === null ? null : <BudgetDetailCard id={selected} />}
    </div>
  );
}

function BudgetList(props: {
  readonly budgets: readonly BudgetSummary[];
  readonly onSelect: (id: string) => void;
}): JSX.Element {
  return (
    <SimpleTable headers={['Año', 'Estado', 'Líneas', 'Total planeado', '']} caption="Presupuestos">
      {props.budgets.map((budget) => (
        <tr key={budget.id}>
          <td className="p-2 font-medium">{budget.year}</td>
          <td className="p-2">
            <Badge>{STATUS[budget.status]}</Badge>
          </td>
          <td className="p-2">{budget.line_count}</td>
          <td className="p-2">{formatPesos(budget.planned_total)}</td>
          <td className="p-2">
            <Button
              type="button"
              size="sm"
              variant="outline"
              aria-label={`Ver el presupuesto ${String(budget.year)}`}
              onClick={() => {
                props.onSelect(budget.id);
              }}
            >
              Ver
            </Button>
          </td>
        </tr>
      ))}
    </SimpleTable>
  );
}

function CreateBudgetDialog(): JSX.Element {
  return (
    <div>
      <RecordDialog
        triggerLabel="Nuevo presupuesto"
        title="Nuevo presupuesto"
        description="Se crea en borrador; luego agregue sus líneas y pida la aprobación."
      >
        {(close) => <CreateBudgetForm onDone={close} />}
      </RecordDialog>
    </div>
  );
}

function CreateBudgetForm({ onDone }: { readonly onDone: () => void }): JSX.Element {
  const api = useApiClient();
  const [year, setYear] = useState(String(new Date().getFullYear()));
  const [problem, setProblem] = useState<string | undefined>();
  const action = useLedgerAction<{ year: number }>(
    (body, csrfToken) =>
      api.post('/v1/finance/budgets', { body, schema: invoiceCreatedResponseSchema, csrfToken }),
    onDone,
  );
  return (
    <form
      noValidate
      className="flex flex-col gap-4"
      onSubmit={(event) => {
        event.preventDefault();
        const valid = createBudgetSchema.safeParse({ year: Number(year) });
        setProblem(valid.success ? undefined : problemsOf(valid.error)['year']);
        if (valid.success) action.execute(valid.data);
      }}
    >
      <LedgerField id="budget-year" label="Año" value={year} onChange={setYear} error={problem} />
      {action.error === null ? null : <FormError error={action.error} />}
      <SubmitButton label="Crear presupuesto" pendingLabel="Creando…" pending={action.pending} />
      {action.dialog}
    </form>
  );
}

function BudgetDetailCard({ id }: { readonly id: string }): JSX.Element {
  const detail = useLedgerQuery(`/v1/finance/budgets/${id}`, budgetDetailEnvelopeSchema);
  return (
    <QueryState query={detail} loadingLabel="Cargando el presupuesto">
      {(result) => (
        <Card className="animate-enter">
          <CardHeader>
            <CardTitle className="text-base">
              Presupuesto {result.data.year} · {STATUS[result.data.status]}
            </CardTitle>
            <CardDescription>
              Total planeado: {formatPesos(result.data.planned_total)}
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            <BudgetActions budget={result.data} />
            <BudgetLineEditor budget={result.data} />
            <BudgetExecutionTable id={id} />
          </CardContent>
        </Card>
      )}
    </QueryState>
  );
}

function BudgetActions({ budget }: { readonly budget: BudgetDetail }): JSX.Element | null {
  const api = useApiClient();
  const { can } = usePermissions();
  if (budget.status !== 'draft' || !can('finance.budget.approve')) return null;
  if (budget.mine) {
    return (
      <p className="text-sm text-muted-foreground">
        Lo aprueba una persona distinta de quien lo elaboró.
      </p>
    );
  }
  return (
    <ActionButton
      label="Aprobar presupuesto"
      pendingLabel="Aprobando…"
      ariaLabel={`Aprobar presupuesto ${String(budget.year)}`}
      run={(csrfToken) =>
        api.post(`/v1/finance/budgets/${budget.id}/approval`, {
          body: {},
          version: budget.version,
          csrfToken,
        })
      }
    />
  );
}

function BudgetExecutionTable({ id }: { readonly id: string }): JSX.Element {
  const execution = useLedgerQuery(
    `/v1/finance/budgets/${id}/execution`,
    budgetExecutionEnvelopeSchema,
  );
  return (
    <QueryState query={execution} loadingLabel="Calculando la ejecución">
      {(result) => (
        <SimpleTable
          headers={['Centro de costo', 'Planeado', 'Ejecutado', 'Ejecución']}
          caption="Ejecución contra lo planeado por centro de costo"
        >
          {result.data.by_cost_center.map((row) => (
            <tr key={row.cost_center.id}>
              <td className="p-2">
                {row.cost_center.code} · {row.cost_center.name}
              </td>
              <td className="p-2">{formatPesos(row.planned)}</td>
              <td className="p-2">{formatPesos(row.executed)}</td>
              <td className="p-2">{percentOf(row.executed, row.planned)}</td>
            </tr>
          ))}
        </SimpleTable>
      )}
    </QueryState>
  );
}

/** Porcentaje ejecutado, solo para mostrar (los valores exactos vienen de la API). */
function percentOf(executed: string, planned: string): string {
  const base = Number(planned);
  if (base === 0) return '—';
  return `${(Math.round((Number(executed) / base) * 1000) / 10).toFixed(1).replace('.', ',')} %`;
}

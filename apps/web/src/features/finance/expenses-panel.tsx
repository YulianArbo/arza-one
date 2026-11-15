'use client';

import { expenseListResponseSchema, rejectExpenseSchema, type Expense } from '@arza/contracts';
import { Badge, EmptyState, SimpleTable } from '@arza/ui';
import { Receipt } from 'lucide-react';
import { useState, type JSX } from 'react';

import { PageHeader } from '../../components/app-shell/page-header';
import { formatDate } from '../../lib/format/date-time';
import { useApiClient } from '../../lib/api/api-provider';
import { FormError } from '../access/form-alert';
import { SubmitButton } from '../access/submit-button';
import { QueryState } from '../administration/query-state';
import { formatPesos } from '../crm/labels';
import { RecordDialog } from '../organization/record-dialog';
import { usePermissions } from '../session/permissions';
import { ExpenseForm } from './expense-form';
import {
  ActionButton,
  LedgerField,
  NewRecord,
  problemsOf,
  useLedgerAction,
  useLedgerQuery,
} from './ledger-ui';

// Gastos con soporte (B32): el colaborador registra los suyos; Finanzas los aprueba o rechaza.

const STATUS = { pending: 'Pendiente', approved: 'Aprobado', rejected: 'Rechazado' } as const;

const DESCRIPTIONS = {
  all: 'Gastos de la empresa con su soporte. Los aprueba una persona distinta de quien los registró.',
  mine: 'Registre sus gastos con su soporte y siga su aprobación.',
};

export function ExpensesPanel(): JSX.Element {
  const { can } = usePermissions();
  const all = can('finance.ledger.read');
  const path = all ? '/v1/finance/expenses' : '/v1/finance/expenses/mine';
  const expenses = useLedgerQuery(path, expenseListResponseSchema);
  return (
    <div className="flex flex-col gap-4">
      <PageHeader title="Gastos" description={all ? DESCRIPTIONS.all : DESCRIPTIONS.mine} />
      <NewRecord
        allowed={can('finance.expense.manage')}
        label="Registrar gasto"
        title="Registrar gasto"
        description="Adjunte el soporte. Queda pendiente hasta que Finanzas lo apruebe."
      >
        {(close) => <ExpenseForm onDone={close} />}
      </NewRecord>
      <QueryState query={expenses} loadingLabel="Cargando gastos">
        {(result) =>
          result.data.length === 0 ? (
            <EmptyState
              icon={<Receipt />}
              title="Aún no hay gastos"
              description="Los gastos registrados aparecerán aquí con su estado."
            />
          ) : (
            <ExpenseTable expenses={result.data} />
          )
        }
      </QueryState>
    </div>
  );
}

function ExpenseTable({ expenses }: { readonly expenses: readonly Expense[] }): JSX.Element {
  return (
    <SimpleTable
      headers={['Código', 'Fecha', 'Rubro', 'Centro de costo', 'Valor', 'Estado', '']}
      caption="Gastos"
    >
      {expenses.map((expense) => (
        <tr key={expense.id}>
          <td className="p-2 font-medium">{expense.code}</td>
          <td className="p-2">{formatDate(expense.expense_date)}</td>
          <td className="p-2">{expense.category.label}</td>
          <td className="p-2">{expense.cost_center.code}</td>
          <td className="p-2">{formatPesos(expense.amount)}</td>
          <td className="p-2">
            <Badge>{STATUS[expense.status]}</Badge>
            {expense.decision_note === null ? null : (
              <span className="block text-xs text-muted-foreground">{expense.decision_note}</span>
            )}
          </td>
          <td className="p-2">
            <ExpenseDecision expense={expense} />
          </td>
        </tr>
      ))}
    </SimpleTable>
  );
}

function ExpenseDecision({ expense }: { readonly expense: Expense }): JSX.Element | null {
  const api = useApiClient();
  const { can } = usePermissions();
  if (expense.status !== 'pending' || !can('finance.expense.approve')) return null;
  if (expense.mine) {
    return <span className="text-xs text-muted-foreground">Lo aprueba otra persona</span>;
  }
  return (
    <div className="flex flex-wrap gap-2">
      <ActionButton
        label="Aprobar"
        pendingLabel="Aprobando…"
        ariaLabel={`Aprobar el gasto ${expense.code}`}
        run={(csrfToken) =>
          api.post(`/v1/finance/expenses/${expense.id}/approval`, {
            body: {},
            version: expense.version,
            csrfToken,
          })
        }
      />
      <RecordDialog
        triggerLabel="Rechazar"
        triggerAriaLabel={`Rechazar el gasto ${expense.code}`}
        title={`Rechazar el gasto ${expense.code}`}
        description="Escriba el motivo; la persona que lo registró lo verá."
        variant="outline"
      >
        {(close) => <RejectForm expense={expense} onDone={close} />}
      </RecordDialog>
    </div>
  );
}

function RejectForm(props: {
  readonly expense: Expense;
  readonly onDone: () => void;
}): JSX.Element {
  const api = useApiClient();
  const [reason, setReason] = useState('');
  const [problem, setProblem] = useState<string | undefined>();
  const action = useLedgerAction<{ reason: string }>(
    (body, csrfToken) =>
      api.post(`/v1/finance/expenses/${props.expense.id}/rejection`, {
        body,
        version: props.expense.version,
        csrfToken,
      }),
    props.onDone,
  );
  return (
    <form
      noValidate
      className="flex flex-col gap-4"
      onSubmit={(event) => {
        event.preventDefault();
        const valid = rejectExpenseSchema.safeParse({ reason });
        setProblem(valid.success ? undefined : problemsOf(valid.error)['reason']);
        if (valid.success) action.execute(valid.data);
      }}
    >
      <LedgerField
        id="reject-reason"
        label="Motivo"
        value={reason}
        onChange={setReason}
        error={problem}
      />
      {action.error === null ? null : <FormError error={action.error} />}
      <SubmitButton label="Rechazar gasto" pendingLabel="Rechazando…" pending={action.pending} />
      {action.dialog}
    </form>
  );
}

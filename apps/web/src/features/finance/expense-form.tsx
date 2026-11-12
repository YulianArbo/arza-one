'use client';

import {
  createExpenseSchema,
  invoiceCreatedResponseSchema,
  type CreateExpense,
} from '@arza/contracts';
import { useState, type JSX } from 'react';

import { FormSummary } from '../../components/form-summary';
import { useApiClient } from '../../lib/api/api-provider';
import { FormError } from '../access/form-alert';
import { SubmitButton } from '../access/submit-button';
import { SourceUpload } from '../documents/source-upload';
import {
  CategoryChoice,
  CostCenterChoice,
  LedgerChoice,
  LedgerField,
  problemsOf,
  useFinanceOptions,
  useLedgerAction,
  useValues,
} from './ledger-ui';

// Registrar un gasto con su soporte (B32). El proveedor es opcional.

const FIELDS = [
  { field: 'expense_date', id: 'expense-date', label: 'Fecha' },
  { field: 'amount', id: 'expense-amount', label: 'Valor' },
  { field: 'category', id: 'expense-category', label: 'Rubro' },
  { field: 'cost_center_id', id: 'expense-center', label: 'Centro de costo' },
  { field: 'description', id: 'expense-description', label: 'Descripción' },
  { field: 'support_file_id', id: 'expense-support', label: 'Soporte' },
];

const EMPTY = {
  expense_date: '',
  amount: '',
  category: '',
  cost_center_id: '',
  supplier_id: '',
  description: '',
};

type Problems = Record<string, string>;
type Values = ReturnType<typeof useValues<typeof EMPTY>>;

function useExpenseForm(onDone: () => void) {
  const api = useApiClient();
  const form = useValues(EMPTY);
  const [fileId, setFileId] = useState<string | null>(null);
  const [problems, setProblems] = useState<Problems>({});
  const [key] = useState(() => crypto.randomUUID());
  const action = useLedgerAction<CreateExpense>(
    (body, csrfToken) =>
      api.post('/v1/finance/expenses', {
        body,
        schema: invoiceCreatedResponseSchema,
        idempotencyKey: key,
        csrfToken,
      }),
    onDone,
  );
  const submit = (): void => {
    const valid = createExpenseSchema.safeParse({
      ...form.values,
      supplier_id: form.values.supplier_id === '' ? null : form.values.supplier_id,
      support_file_id: fileId,
    });
    setProblems(valid.success ? {} : problemsOf(valid.error));
    if (valid.success) action.execute(valid.data);
  };
  return { form, setFileId, problems, action, submit };
}

export function ExpenseForm({ onDone }: { readonly onDone: () => void }): JSX.Element {
  const { form, setFileId, problems, action, submit } = useExpenseForm(onDone);
  return (
    <form
      noValidate
      className="flex flex-col gap-4"
      onSubmit={(event) => {
        event.preventDefault();
        submit();
      }}
    >
      <FormSummary problems={problems} fields={FIELDS} />
      <div className="grid gap-3 sm:grid-cols-2">
        <ExpenseAmountFields form={form} problems={problems} />
        <ExpenseClassFields form={form} problems={problems} />
      </div>
      <SourceUpload
        id="expense-support"
        current={null}
        label="Soporte del gasto"
        onChange={setFileId}
        error={problems['support_file_id'] === undefined ? undefined : 'Adjunte el soporte.'}
      />
      {action.error === null ? null : <FormError error={action.error} />}
      <SubmitButton label="Registrar gasto" pendingLabel="Registrando…" pending={action.pending} />
      {action.dialog}
    </form>
  );
}

function ExpenseAmountFields(props: {
  readonly form: Values;
  readonly problems: Problems;
}): JSX.Element {
  const { values, set } = props.form;
  return (
    <>
      <LedgerField
        id="expense-date"
        label="Fecha"
        type="date"
        value={values.expense_date}
        onChange={set('expense_date')}
        error={props.problems['expense_date']}
      />
      <LedgerField
        id="expense-amount"
        label="Valor"
        decimal
        value={values.amount}
        onChange={set('amount')}
        error={props.problems['amount']}
      />
      <LedgerField
        id="expense-description"
        label="Descripción"
        value={values.description}
        onChange={set('description')}
        error={props.problems['description']}
      />
    </>
  );
}

function ExpenseClassFields(props: {
  readonly form: Values;
  readonly problems: Problems;
}): JSX.Element {
  const options = useFinanceOptions();
  const { values, set } = props.form;
  return (
    <>
      <CategoryChoice
        id="expense-category"
        value={values.category}
        onChange={set('category')}
        error={props.problems['category']}
      />
      <CostCenterChoice
        id="expense-center"
        value={values.cost_center_id}
        onChange={set('cost_center_id')}
        error={props.problems['cost_center_id']}
      />
      <LedgerChoice
        id="expense-supplier"
        label="Proveedor (opcional)"
        value={values.supplier_id}
        onChange={set('supplier_id')}
        placeholder="Sin proveedor"
        options={(options?.suppliers ?? []).map((party) => ({
          value: party.id,
          label: party.name,
        }))}
      />
    </>
  );
}

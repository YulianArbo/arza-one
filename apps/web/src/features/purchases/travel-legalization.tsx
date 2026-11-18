'use client';

import {
  addTravelExpenseSchema,
  purchaseCreatedResponseSchema,
  type AddTravelExpense,
  type TravelRequest,
} from '@arza/contracts';
import { SimpleTable } from '@arza/ui';
import { useState, type JSX } from 'react';

import { useApiClient } from '../../lib/api/api-provider';
import { FormError } from '../access/form-alert';
import { SubmitButton } from '../access/submit-button';
import { formatPesos } from '../crm/labels';
import { SourceUpload } from '../documents/source-upload';
import { LedgerField, problemsOf, useValues } from '../finance/ledger-ui';
import { PurchaseButton, usePurchaseAction } from './purchase-ui';

// Legalización de un viaje aprobado (B33, FT-ADM-004): el viajero registra cada gasto con su
// soporte y, al terminar, lo legaliza. El saldo dice si devuelve dinero o si se le debe.

/** «Debe devolver $ 30.000», «Se le deben $ 70.000» o «Sin saldo». */
export function balanceText(balance: string): string {
  const value = Number(balance);
  if (value === 0) return 'Sin saldo: los gastos igualan el anticipo.';
  const amount = formatPesos(balance.replace('-', ''));
  return value > 0 ? `El viajero debe devolver ${amount}.` : `Al viajero se le deben ${amount}.`;
}

export function TravelLegalization(props: {
  readonly travel: TravelRequest;
  readonly onDone: () => void;
}): JSX.Element {
  const api = useApiClient();
  const { travel } = props;
  return (
    <div className="flex flex-col gap-4">
      <ExpenseTable travel={travel} editable />
      <ExpenseForm travel={travel} />
      {travel.expenses.length === 0 ? null : (
        <PurchaseButton
          label="Legalizar viaje"
          pendingLabel="Legalizando…"
          ariaLabel={`Legalizar viaje ${travel.code}`}
          run={async (csrfToken) => {
            await api.post(`/v1/travel-requests/${travel.id}/legalization`, {
              body: {},
              version: travel.version,
              csrfToken,
            });
            props.onDone();
          }}
        />
      )}
    </div>
  );
}

export function ExpenseTable(props: {
  readonly travel: TravelRequest;
  readonly editable?: boolean;
}): JSX.Element {
  const api = useApiClient();
  const { travel } = props;
  if (travel.expenses.length === 0) {
    return <p className="text-sm text-muted-foreground">Aún no hay gastos registrados.</p>;
  }
  return (
    <div className="flex flex-col gap-2">
      <SimpleTable headers={['Concepto', 'Valor', '']} caption={`Gastos del viaje ${travel.code}`}>
        {travel.expenses.map((expense) => (
          <tr key={expense.id}>
            <td className="p-2">{expense.concept}</td>
            <td className="p-2">{formatPesos(expense.amount)}</td>
            <td className="p-2">
              {props.editable === true ? (
                <PurchaseButton
                  label="Quitar"
                  pendingLabel="Quitando…"
                  ariaLabel={`Quitar el gasto ${expense.concept}`}
                  run={(csrfToken) =>
                    api.delete(`/v1/travel-expenses/${expense.id}`, { csrfToken })
                  }
                />
              ) : null}
            </td>
          </tr>
        ))}
      </SimpleTable>
      <p className="text-sm" role="status">
        Gastos: {formatPesos(travel.expenses_total)} · Anticipo:{' '}
        {formatPesos(travel.advance_amount)}. {balanceText(travel.balance)}
      </p>
    </div>
  );
}

const EMPTY = { concept: '', amount: '' };

function useExpenseForm(travel: TravelRequest) {
  const api = useApiClient();
  const form = useValues(EMPTY);
  const [fileId, setFileId] = useState<string | null>(null);
  const [problems, setProblems] = useState<Record<string, string>>({});
  const [round, setRound] = useState(0);
  const [key, setKey] = useState(() => crypto.randomUUID());
  const action = usePurchaseAction<AddTravelExpense>(
    (body, csrfToken) =>
      api.post(`/v1/travel-requests/${travel.id}/expenses`, {
        body,
        schema: purchaseCreatedResponseSchema,
        idempotencyKey: key,
        csrfToken,
      }),
    () => {
      form.reset();
      setFileId(null);
      setKey(crypto.randomUUID());
      setRound((current) => current + 1);
    },
  );
  const submit = (): void => {
    const valid = addTravelExpenseSchema.safeParse({
      concept: form.values.concept,
      amount: form.values.amount.trim().replace(',', '.'),
      support_file_id: fileId,
    });
    setProblems(valid.success ? {} : problemsOf(valid.error));
    if (valid.success) action.execute(valid.data);
  };
  return { form, setFileId, problems, action, submit, round };
}

function ExpenseForm({ travel }: { readonly travel: TravelRequest }): JSX.Element {
  const { form, setFileId, problems, action, submit, round } = useExpenseForm(travel);
  return (
    <form
      noValidate
      aria-label="Agregar gasto del viaje"
      className="flex flex-col gap-3"
      onSubmit={(event) => {
        event.preventDefault();
        submit();
      }}
    >
      <ExpenseFields form={form} problems={problems} />
      <SourceUpload
        key={round}
        id="travel-expense-support"
        current={null}
        label="Soporte del gasto"
        onChange={setFileId}
        error={problems['support_file_id'] === undefined ? undefined : 'Adjunte el soporte.'}
      />
      {action.error === null ? null : <FormError error={action.error} />}
      <SubmitButton label="Agregar gasto" pendingLabel="Agregando…" pending={action.pending} />
      {action.dialog}
    </form>
  );
}

function ExpenseFields(props: {
  readonly form: ReturnType<typeof useExpenseForm>['form'];
  readonly problems: Record<string, string>;
}): JSX.Element {
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      <LedgerField
        id="travel-expense-concept"
        label="Concepto"
        value={props.form.values.concept}
        onChange={props.form.set('concept')}
        error={props.problems['concept']}
      />
      <LedgerField
        id="travel-expense-amount"
        label="Valor"
        decimal
        value={props.form.values.amount}
        onChange={props.form.set('amount')}
        error={props.problems['amount']}
      />
    </div>
  );
}

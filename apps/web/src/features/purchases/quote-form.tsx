'use client';

import {
  addPurchaseQuoteSchema,
  purchaseCreatedResponseSchema,
  type AddPurchaseQuote,
  type PurchaseRequest,
} from '@arza/contracts';
import { useState, type JSX } from 'react';

import { FormSummary } from '../../components/form-summary';
import { useApiClient } from '../../lib/api/api-provider';
import { FormError } from '../access/form-alert';
import { SubmitButton } from '../access/submit-button';
import { SourceUpload } from '../documents/source-upload';
import { LedgerChoice, LedgerField, problemsOf, useValues } from '../finance/ledger-ui';
import { usePurchaseAction, usePurchaseOptions } from './purchase-ui';

// Agregar la cotización de un proveedor a una solicitud aprobada (B33), con su archivo.

const FIELDS = [
  { field: 'supplier_id', id: 'quote-supplier', label: 'Proveedor' },
  { field: 'amount', id: 'quote-amount', label: 'Valor' },
  { field: 'delivery_days', id: 'quote-days', label: 'Días de entrega' },
  { field: 'file_id', id: 'quote-file', label: 'Cotización' },
];

const EMPTY = { supplier_id: '', amount: '', delivery_days: '' };

type Problems = Record<string, string>;
type Values = ReturnType<typeof useValues<typeof EMPTY>>;

function useQuoteForm(request: PurchaseRequest, onDone: () => void) {
  const api = useApiClient();
  const form = useValues(EMPTY);
  const [fileId, setFileId] = useState<string | null>(null);
  const [problems, setProblems] = useState<Problems>({});
  const action = usePurchaseAction<AddPurchaseQuote>(
    (body, csrfToken) =>
      api.post(`/v1/purchase-requests/${request.id}/quotes`, {
        body,
        schema: purchaseCreatedResponseSchema,
        csrfToken,
      }),
    onDone,
  );
  const submit = (): void => {
    const days = form.values.delivery_days.trim();
    const valid = addPurchaseQuoteSchema.safeParse({
      supplier_id: form.values.supplier_id,
      amount: form.values.amount.trim().replace(',', '.'),
      delivery_days: days === '' ? Number.NaN : Number(days),
      file_id: fileId,
    });
    setProblems(valid.success ? {} : problemsOf(valid.error));
    if (valid.success) action.execute(valid.data);
  };
  return { form, setFileId, problems, action, submit };
}

export function QuoteForm(props: {
  readonly request: PurchaseRequest;
  readonly onDone: () => void;
}): JSX.Element {
  const { form, setFileId, problems, action, submit } = useQuoteForm(props.request, props.onDone);
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
      <QuoteFields form={form} problems={problems} request={props.request} />
      <SourceUpload
        id="quote-file"
        current={null}
        label="Cotización del proveedor"
        onChange={setFileId}
        error={problems['file_id'] === undefined ? undefined : 'Adjunte la cotización.'}
      />
      {action.error === null ? null : <FormError error={action.error} />}
      <SubmitButton label="Agregar cotización" pendingLabel="Agregando…" pending={action.pending} />
      {action.dialog}
    </form>
  );
}

function QuoteFields(props: {
  readonly form: Values;
  readonly problems: Problems;
  readonly request: PurchaseRequest;
}): JSX.Element {
  const { values, set } = props.form;
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      <SupplierChoice
        value={values.supplier_id}
        onChange={set('supplier_id')}
        problem={props.problems['supplier_id']}
        taken={props.request.quotes.map((quote) => quote.supplier.id)}
      />
      <LedgerField
        id="quote-amount"
        label="Valor"
        decimal
        value={values.amount}
        onChange={set('amount')}
        error={props.problems['amount']}
      />
      <LedgerField
        id="quote-days"
        label="Días de entrega"
        value={values.delivery_days}
        onChange={set('delivery_days')}
        error={
          props.problems['delivery_days'] === undefined
            ? undefined
            : 'Escriba los días de entrega, de 0 a 365.'
        }
      />
    </div>
  );
}

/** Proveedores vigentes que aún no cotizaron esta solicitud. */
function SupplierChoice(props: {
  readonly value: string;
  readonly onChange: (value: string) => void;
  readonly problem: string | undefined;
  readonly taken: readonly string[];
}): JSX.Element {
  const options = usePurchaseOptions();
  const suppliers = (options?.suppliers ?? []).filter((item) => !props.taken.includes(item.id));
  return (
    <LedgerChoice
      id="quote-supplier"
      label="Proveedor"
      value={props.value}
      onChange={props.onChange}
      error={props.problem === undefined ? undefined : 'Elija un proveedor.'}
      options={suppliers.map((supplier) => ({
        value: supplier.id,
        label: supplier.verified
          ? supplier.name
          : `${supplier.name} (sin conocimiento del tercero vigente)`,
      }))}
    />
  );
}

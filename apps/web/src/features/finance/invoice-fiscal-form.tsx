'use client';

import { registerFiscalInvoiceSchema, type InvoiceSummary } from '@arza/contracts';
import { useState, type Dispatch, type JSX, type SetStateAction, type SubmitEvent } from 'react';

import { useApiClient } from '../../lib/api/api-provider';
import { FormError } from '../access/form-alert';
import { SubmitButton } from '../access/submit-button';
import { SourceUpload } from '../documents/source-upload';
import { useFinanceAction } from './invoice-finance-data';
import { InvoiceField } from './invoice-field';

interface FiscalValues {
  issue_date: string;
  due_date: string;
  subtotal: string;
  tax_rate: string;
  tax_total: string;
  withholding_total: string;
  total: string;
  fiscal_number: string;
  fiscal_uuid: string;
}

const FISCAL_FIELDS: readonly {
  readonly name: keyof FiscalValues;
  readonly label: string;
  readonly type?: 'text' | 'date';
  readonly decimal?: boolean;
}[] = [
  { name: 'issue_date', label: 'Fecha de emisión', type: 'date' },
  { name: 'due_date', label: 'Fecha de vencimiento', type: 'date' },
  { name: 'subtotal', label: 'Subtotal registrado', decimal: true },
  { name: 'tax_rate', label: 'Tarifa registrada (%)', decimal: true },
  { name: 'tax_total', label: 'Impuestos registrados', decimal: true },
  { name: 'withholding_total', label: 'Retenciones registradas', decimal: true },
  { name: 'total', label: 'Total fiscal', decimal: true },
  { name: 'fiscal_number', label: 'Número fiscal' },
  { name: 'fiscal_uuid', label: 'Identificador fiscal (opcional)' },
];

function useFiscalForm(props: { readonly invoice: InvoiceSummary; readonly onDone: () => void }) {
  const api = useApiClient();
  const [values, setValues] = useState<FiscalValues>({
    issue_date: '',
    due_date: '',
    subtotal: props.invoice.requested_amount,
    tax_rate: '',
    tax_total: '',
    withholding_total: '',
    total: '',
    fiscal_number: '',
    fiscal_uuid: '',
  });
  const [fileId, setFileId] = useState<string | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const [key] = useState(() => crypto.randomUUID());
  const action = useFinanceAction<{ body: ReturnType<typeof registerFiscalInvoiceSchema.parse> }>(
    ({ body }, csrfToken) =>
      api.post(`/v1/finance/invoices/${props.invoice.id}/fiscal-document`, {
        body,
        version: props.invoice.version,
        idempotencyKey: key,
        csrfToken,
      }),
    props.onDone,
  );
  return { values, setValues, fileId, setFileId, problem, setProblem, action };
}

export function FiscalInvoiceForm(props: {
  readonly invoice: InvoiceSummary;
  readonly onDone: () => void;
}): JSX.Element {
  const form = useFiscalForm(props);
  return (
    <form
      noValidate
      onSubmit={(event) => {
        submitFiscal(event, form);
      }}
      className="flex flex-col gap-4"
    >
      <FiscalFields
        values={form.values}
        setValues={form.setValues}
        fileId={form.fileId}
        setFileId={form.setFileId}
      />
      {form.problem === null ? null : <p className="text-sm text-destructive">{form.problem}</p>}
      {form.action.error === null ? null : <FormError error={form.action.error} />}
      <SubmitButton
        label="Registrar documento fiscal"
        pendingLabel="Registrando…"
        pending={form.action.pending}
      />
      {form.action.dialog}
    </form>
  );
}

function FiscalFields(props: {
  readonly values: FiscalValues;
  readonly setValues: Dispatch<SetStateAction<FiscalValues>>;
  readonly fileId: string | null;
  readonly setFileId: (id: string | null) => void;
}): JSX.Element {
  const update = (name: keyof FiscalValues, value: string): void => {
    props.setValues((current) => ({ ...current, [name]: value }));
  };
  return (
    <>
      <p className="text-sm text-muted-foreground">
        Digite los valores del documento fiscal emitido. La plataforma no calcula impuestos.
      </p>
      <div className="grid gap-3 sm:grid-cols-2">
        {FISCAL_FIELDS.map((field) => (
          <InvoiceField
            key={field.name}
            id={`fiscal-${field.name}`}
            label={field.label}
            type={field.type}
            decimal={field.decimal}
            value={props.values[field.name]}
            onChange={(value) => {
              update(field.name, value);
            }}
          />
        ))}
      </div>
      <SourceUpload
        current={null}
        label="Soporte fiscal (PDF recomendado)"
        onChange={props.setFileId}
      />
    </>
  );
}

function submitFiscal(
  event: SubmitEvent<HTMLFormElement>,
  form: ReturnType<typeof useFiscalForm>,
): void {
  event.preventDefault();
  const result = registerFiscalInvoiceSchema.safeParse({
    ...form.values,
    tax_rate: form.values.tax_rate.trim() === '' ? null : form.values.tax_rate.trim(),
    fiscal_uuid: form.values.fiscal_uuid.trim() === '' ? null : form.values.fiscal_uuid.trim(),
    fiscal_file_id: form.fileId,
  });
  form.setProblem(
    result.success
      ? null
      : 'Revise las fechas, los valores registrados y el archivo fiscal disponible.',
  );
  if (result.success) form.action.execute({ body: result.data });
}

'use client';

import {
  createCreditNoteSchema,
  createPaymentSchema,
  invoiceCreatedResponseSchema,
  type InvoiceSummary,
} from '@arza/contracts';
import { useState, type Dispatch, type JSX, type SetStateAction, type SubmitEvent } from 'react';

import { useApiClient } from '../../lib/api/api-provider';
import { FormError } from '../access/form-alert';
import { SubmitButton } from '../access/submit-button';
import { SourceUpload } from '../documents/source-upload';
import { useFinanceAction } from './invoice-finance-data';
import { InvoiceField } from './invoice-field';

interface CreditValues {
  reason: string;
  amount: string;
  issue_date: string;
  fiscal_number: string;
  fiscal_uuid: string;
}
interface PaymentValues {
  readonly paid_on: string;
  readonly amount: string;
  readonly method: string;
  readonly reference: string;
}

const CREDIT_INPUTS: readonly {
  readonly name: Exclude<keyof CreditValues, 'reason'>;
  readonly label: string;
  readonly type?: 'text' | 'date';
  readonly decimal?: boolean;
}[] = [
  { name: 'amount', label: 'Valor de la nota crédito', decimal: true },
  { name: 'issue_date', label: 'Fecha de emisión', type: 'date' },
  { name: 'fiscal_number', label: 'Número fiscal' },
  { name: 'fiscal_uuid', label: 'Identificador fiscal (opcional)' },
];

const PAYMENT_INPUTS: readonly {
  readonly name: keyof PaymentValues;
  readonly label: string;
  readonly type?: 'text' | 'date';
  readonly decimal?: boolean;
}[] = [
  { name: 'paid_on', label: 'Fecha del recaudo', type: 'date' },
  { name: 'amount', label: 'Valor recibido', decimal: true },
  { name: 'method', label: 'Medio de pago' },
  { name: 'reference', label: 'Referencia (opcional)' },
];

function useCreditForm(invoice: InvoiceSummary, onDone: () => void) {
  const api = useApiClient();
  const [values, setValues] = useState<CreditValues>({
    reason: '',
    amount: '',
    issue_date: '',
    fiscal_number: '',
    fiscal_uuid: '',
  });
  const [fileId, setFileId] = useState<string | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const [key] = useState(() => crypto.randomUUID());
  const action = useFinanceAction<{ body: ReturnType<typeof createCreditNoteSchema.parse> }>(
    ({ body }, csrfToken) =>
      api.post(`/v1/finance/invoices/${invoice.id}/credit-notes`, {
        body,
        schema: invoiceCreatedResponseSchema,
        idempotencyKey: key,
        csrfToken,
      }),
    onDone,
  );
  return { values, setValues, fileId, setFileId, problem, setProblem, action };
}

export function CreditNoteForm(props: {
  readonly invoice: InvoiceSummary;
  readonly onDone: () => void;
}): JSX.Element {
  const form = useCreditForm(props.invoice, props.onDone);
  return (
    <form
      noValidate
      onSubmit={(event) => {
        submitCredit(event, form);
      }}
      className="flex flex-col gap-4"
    >
      <CreditFields
        values={form.values}
        setValues={form.setValues}
        fileId={form.fileId}
        setFileId={form.setFileId}
      />
      {form.problem === null ? null : <p className="text-sm text-destructive">{form.problem}</p>}
      {form.action.error === null ? null : <FormError error={form.action.error} />}
      <SubmitButton
        label="Registrar nota crédito"
        pendingLabel="Registrando…"
        pending={form.action.pending}
      />
      {form.action.dialog}
    </form>
  );
}

function CreditFields(props: {
  readonly values: CreditValues;
  readonly setValues: Dispatch<SetStateAction<CreditValues>>;
  readonly fileId: string | null;
  readonly setFileId: (id: string | null) => void;
}): JSX.Element {
  const update = (name: keyof CreditValues, value: string): void => {
    props.setValues((current) => ({ ...current, [name]: value }));
  };
  return (
    <>
      <CreditReasonField
        value={props.values.reason}
        onChange={(value) => {
          update('reason', value);
        }}
      />
      <div className="grid gap-3 sm:grid-cols-2">
        {CREDIT_INPUTS.map((field) => (
          <InvoiceField
            key={field.name}
            id={`credit-${field.name}`}
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
        label="Soporte fiscal de la nota crédito"
        onChange={props.setFileId}
      />
    </>
  );
}

function CreditReasonField(props: {
  readonly value: string;
  readonly onChange: (value: string) => void;
}): JSX.Element {
  return (
    <InvoiceField id="credit-reason" label="Motivo" value={props.value} onChange={props.onChange} />
  );
}

function submitCredit(
  event: SubmitEvent<HTMLFormElement>,
  form: ReturnType<typeof useCreditForm>,
): void {
  event.preventDefault();
  const result = createCreditNoteSchema.safeParse({
    ...form.values,
    fiscal_uuid: form.values.fiscal_uuid.trim() === '' ? null : form.values.fiscal_uuid.trim(),
    fiscal_file_id: form.fileId,
  });
  form.setProblem(
    result.success ? null : 'Complete los datos de la nota crédito y seleccione su soporte fiscal.',
  );
  if (result.success) form.action.execute({ body: result.data });
}

function usePaymentForm(invoice: InvoiceSummary, onDone: () => void) {
  const api = useApiClient();
  const [values, setValues] = useState<PaymentValues>({
    paid_on: '',
    amount: '',
    method: '',
    reference: '',
  });
  const [problem, setProblem] = useState<string | null>(null);
  const [key] = useState(() => crypto.randomUUID());
  const action = useFinanceAction<{ body: ReturnType<typeof createPaymentSchema.parse> }>(
    ({ body }, csrfToken) =>
      api.post(`/v1/finance/invoices/${invoice.id}/payments`, {
        body,
        schema: invoiceCreatedResponseSchema,
        idempotencyKey: key,
        csrfToken,
      }),
    onDone,
  );
  return { values, setValues, problem, setProblem, action };
}

export function PaymentForm(props: {
  readonly invoice: InvoiceSummary;
  readonly onDone: () => void;
}): JSX.Element {
  const form = usePaymentForm(props.invoice, props.onDone);
  return (
    <form
      noValidate
      onSubmit={(event) => {
        submitPayment(event, form);
      }}
      className="flex flex-col gap-4"
    >
      <PaymentFields values={form.values} setValues={form.setValues} />
      {form.problem === null ? null : <p className="text-sm text-destructive">{form.problem}</p>}
      {form.action.error === null ? null : <FormError error={form.action.error} />}
      <SubmitButton
        label="Registrar recaudo"
        pendingLabel="Registrando…"
        pending={form.action.pending}
      />
      {form.action.dialog}
    </form>
  );
}

function PaymentFields(props: {
  readonly values: PaymentValues;
  readonly setValues: Dispatch<SetStateAction<PaymentValues>>;
}): JSX.Element {
  const update = (name: keyof PaymentValues, value: string): void => {
    props.setValues((current) => ({ ...current, [name]: value }));
  };
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      {PAYMENT_INPUTS.map((field) => (
        <InvoiceField
          key={field.name}
          id={`payment-${field.name}`}
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
  );
}

function submitPayment(
  event: SubmitEvent<HTMLFormElement>,
  form: ReturnType<typeof usePaymentForm>,
): void {
  event.preventDefault();
  const result = createPaymentSchema.safeParse({
    ...form.values,
    reference: form.values.reference.trim() || null,
    support_file_id: null,
  });
  form.setProblem(result.success ? null : 'Revise la fecha, el valor y el medio del recaudo.');
  if (result.success) form.action.execute({ body: result.data });
}

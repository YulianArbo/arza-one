'use client';

import { voidInvoiceSchema, type InvoiceSummary } from '@arza/contracts';
import { useState, type JSX, type SubmitEvent } from 'react';

import { useApiClient } from '../../lib/api/api-provider';
import { FormError } from '../access/form-alert';
import { SubmitButton } from '../access/submit-button';
import { useFinanceAction } from './invoice-finance-data';
import { InvoiceField } from './invoice-field';

export function VoidInvoiceForm(props: {
  readonly invoice: InvoiceSummary;
  readonly onDone: () => void;
}): JSX.Element {
  const api = useApiClient();
  const [reason, setReason] = useState('');
  const [problem, setProblem] = useState<string | null>(null);
  const action = useFinanceAction<{ reason: string }>(
    ({ reason: current }, csrfToken) =>
      api.post(`/v1/finance/invoices/${props.invoice.id}/void`, {
        body: voidInvoiceSchema.parse({ reason: current }),
        version: props.invoice.version,
        csrfToken,
      }),
    props.onDone,
  );
  return (
    <form noValidate className="flex flex-col gap-4" onSubmit={submit}>
      <InvoiceField
        id="void-reason"
        label="Motivo de la anulación"
        value={reason}
        onChange={setReason}
      />
      {problem === null ? null : <p className="text-sm text-destructive">{problem}</p>}
      {action.error === null ? null : <FormError error={action.error} />}
      <SubmitButton label="Anular factura" pendingLabel="Anulando…" pending={action.pending} />
      {action.dialog}
    </form>
  );

  function submit(event: SubmitEvent<HTMLFormElement>): void {
    event.preventDefault();
    const valid = voidInvoiceSchema.safeParse({ reason });
    setProblem(valid.success ? null : 'Escriba el motivo de la anulación (mínimo 3 caracteres).');
    if (valid.success) action.execute({ reason });
  }
}

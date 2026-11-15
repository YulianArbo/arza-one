'use client';

import { invoiceCreatedResponseSchema, requestInvoiceSchema } from '@arza/contracts';
import { Button } from '@arza/ui';
import { useState, type JSX, type SubmitEvent } from 'react';

import { useApiClient } from '../../lib/api/api-provider';
import { FormError } from '../access/form-alert';
import { SubmitButton } from '../access/submit-button';
import { formatPesos } from '../crm/labels';
import { useFinanceAction, useFinanceData } from './invoice-finance-data';
import type { InvoiceSummary } from '@arza/contracts';

export function RequestInvoiceDialog({
  onCreated,
}: {
  readonly onCreated: () => void;
}): JSX.Element {
  const api = useApiClient();
  const { milestones } = useFinanceData();
  const [selected, setSelected] = useState('');
  const [problem, setProblem] = useState<string | null>(null);
  const request = useFinanceAction<{ milestoneId: string; key: string }>(
    async ({ milestoneId, key }, csrfToken) =>
      api.post('/v1/finance/invoices', {
        body: requestInvoiceSchema.parse({ milestone_id: milestoneId }),
        schema: invoiceCreatedResponseSchema,
        idempotencyKey: key,
        csrfToken,
      }),
    onCreated,
  );
  const options = milestones.data?.data ?? [];
  return (
    <form noValidate className="flex flex-col gap-4" onSubmit={submitRequest}>
      <MilestoneOptions options={options} selected={selected} onSelect={setSelected} />
      {problem === null ? null : <p className="text-sm text-destructive">{problem}</p>}
      {request.error === null ? null : <FormError error={request.error} />}
      <SubmitButton label="Solicitar factura" pendingLabel="Guardando…" pending={request.pending} />
      {request.dialog}
    </form>
  );

  function submitRequest(event: SubmitEvent<HTMLFormElement>): void {
    event.preventDefault();
    const valid = requestInvoiceSchema.safeParse({ milestone_id: selected });
    setProblem(valid.success ? null : 'Seleccione un hito listo para facturar.');
    if (valid.success) request.execute({ milestoneId: selected, key: crypto.randomUUID() });
  }
}

export function ApproveInvoiceButton({
  invoice,
}: {
  readonly invoice: InvoiceSummary;
}): JSX.Element {
  const api = useApiClient();
  const [key] = useState(() => crypto.randomUUID());
  const approve = useFinanceAction<{ key: string }>((args, csrfToken) =>
    api.post(`/v1/finance/invoices/${invoice.id}/approval`, {
      body: {},
      version: invoice.version,
      idempotencyKey: args.key,
      csrfToken,
    }),
  );
  return (
    <>
      <Button
        type="button"
        size="sm"
        disabled={approve.pending}
        onClick={() => {
          approve.execute({ key });
        }}
      >
        Aprobar
      </Button>
      {approve.error === null ? null : <FormError error={approve.error} />}
      {approve.dialog}
    </>
  );
}

function MilestoneOptions(props: {
  readonly options: NonNullable<ReturnType<typeof useFinanceData>['milestones']['data']>['data'];
  readonly selected: string;
  readonly onSelect: (id: string) => void;
}): JSX.Element {
  return (
    <label className="flex flex-col gap-1 text-sm font-medium" htmlFor="invoice-milestone">
      Hito listo para facturar
      <select
        id="invoice-milestone"
        value={props.selected}
        onChange={(event) => {
          props.onSelect(event.target.value);
        }}
        className="min-h-11 rounded-md border border-input bg-background px-3 py-2 text-sm"
      >
        <option value="">Seleccione un hito</option>
        {props.options.map((milestone) => (
          <option key={milestone.id} value={milestone.id}>
            {milestone.project_code} · {milestone.name} · {formatPesos(milestone.amount)}
          </option>
        ))}
      </select>
    </label>
  );
}

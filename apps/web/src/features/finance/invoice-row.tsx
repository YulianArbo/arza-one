'use client';

import type { InvoiceSummary } from '@arza/contracts';
import { Badge } from '@arza/ui';
import type { JSX } from 'react';

import { CodeConfirmation } from '../../components/code-confirmation';
import { formatPesos } from '../crm/labels';
import { RecordDialog } from '../organization/record-dialog';
import { usePermissions } from '../session/permissions';
import { ApproveInvoiceButton } from './invoice-request-form';
import { FiscalInvoiceForm } from './invoice-fiscal-form';
import { CreditNoteForm, PaymentForm } from './invoice-settlement-forms';
import { VoidInvoiceForm } from './invoice-void-form';

const STATUSES = {
  requested: 'Solicitada',
  approved: 'Aprobada',
  issued: 'Emitida',
  partially_paid: 'Pago parcial',
  paid: 'Pagada',
  voided: 'Anulada',
} satisfies Record<InvoiceSummary['status'], string>;

export function InvoiceRow({ invoice }: { readonly invoice: InvoiceSummary }): JSX.Element {
  return (
    <li className="flex flex-col gap-3 py-4 lg:flex-row lg:items-center lg:justify-between">
      <InvoiceInfo invoice={invoice} />
      <InvoiceActions invoice={invoice} />
    </li>
  );
}

function InvoiceInfo({ invoice }: { readonly invoice: InvoiceSummary }): JSX.Element {
  return (
    <div className="flex flex-col gap-1">
      <span className="font-medium">
        {invoice.code} · {invoice.party.name}
      </span>
      <span className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
        <Badge>{STATUSES[invoice.status]}</Badge>
        <span>Solicitado: {formatPesos(invoice.requested_amount)}</span>
        {invoice.total === null ? null : <span>Total fiscal: {formatPesos(invoice.total)}</span>}
        {invoice.balance === null ? null : <span>Saldo: {formatPesos(invoice.balance)}</span>}
        {invoice.fiscal_number === null ? null : <span>Número: {invoice.fiscal_number}</span>}
      </span>
    </div>
  );
}

function InvoiceActions({ invoice }: { readonly invoice: InvoiceSummary }): JSX.Element {
  const permissions = usePermissions();
  return (
    <div className="flex flex-wrap items-center gap-2">
      {invoice.status === 'requested' ? <ApproveInvoiceButton invoice={invoice} /> : null}
      {invoice.status === 'approved' ? <FiscalAction invoice={invoice} /> : null}
      {invoice.status === 'issued' || invoice.status === 'partially_paid' ? (
        <PaymentAction invoice={invoice} />
      ) : null}
      {['issued', 'partially_paid', 'paid'].includes(invoice.status) ? (
        <CreditAction invoice={invoice} />
      ) : null}
      {['requested', 'approved'].includes(invoice.status) &&
      permissions.can('finance.invoice.void') ? (
        <VoidAction invoice={invoice} />
      ) : null}
    </div>
  );
}

function VoidAction({ invoice }: { readonly invoice: InvoiceSummary }): JSX.Element {
  return (
    <RecordDialog
      triggerLabel="Anular"
      title={`Anular ${invoice.code}`}
      description="La solicitud quedará anulada; una factura emitida se corrige con nota crédito."
      variant="outline"
    >
      {(close) => (
        <CodeConfirmation code={invoice.code}>
          <VoidInvoiceForm invoice={invoice} onDone={close} />
        </CodeConfirmation>
      )}
    </RecordDialog>
  );
}

function FiscalAction({ invoice }: { readonly invoice: InvoiceSummary }): JSX.Element {
  return (
    <RecordDialog
      triggerLabel="Registrar factura fiscal"
      title={`Registrar ${invoice.code}`}
      description="Registre los datos del documento emitido en el software fiscal."
      variant="outline"
    >
      {(close) => <FiscalInvoiceForm invoice={invoice} onDone={close} />}
    </RecordDialog>
  );
}

function PaymentAction({ invoice }: { readonly invoice: InvoiceSummary }): JSX.Element {
  return (
    <RecordDialog
      triggerLabel="Registrar recaudo"
      title={`Recaudo de ${invoice.code}`}
      description="Aplique un pago recibido a esta factura."
      variant="outline"
    >
      {(close) => <PaymentForm invoice={invoice} onDone={close} />}
    </RecordDialog>
  );
}

function CreditAction({ invoice }: { readonly invoice: InvoiceSummary }): JSX.Element {
  return (
    <RecordDialog
      triggerLabel="Nota crédito"
      title={`Nota crédito de ${invoice.code}`}
      description="Registre la nota crédito emitida y su soporte fiscal."
      variant="outline"
    >
      {(close) => <CreditNoteForm invoice={invoice} onDone={close} />}
    </RecordDialog>
  );
}

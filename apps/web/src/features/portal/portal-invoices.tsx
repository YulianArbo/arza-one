'use client';

import type { PortalInvoice } from '@arza/contracts';
import { Badge, Button, Card, CardContent, EmptyState } from '@arza/ui';
import { ReceiptText } from 'lucide-react';
import type { JSX } from 'react';

import { PageHeader } from '../../components/app-shell/page-header';
import { formatDate } from '../../lib/format/date-time';
import { FormError } from '../access/form-alert';
import { QueryState } from '../administration/query-state';
import { formatPesos } from '../crm/labels';
import { usePortalDownload, usePortalInvoices } from './portal-queries';

const STATUS_LABELS: Readonly<Record<PortalInvoice['status'], string>> = {
  requested: 'Solicitada',
  approved: 'Aprobada',
  issued: 'Emitida',
  partially_paid: 'Pago parcial',
  paid: 'Pagada',
  voided: 'Anulada',
};

function InvoiceRow({ invoice }: { readonly invoice: PortalInvoice }): JSX.Element {
  const download = usePortalDownload();
  return (
    <li className="flex flex-col gap-3 py-4 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex flex-col gap-1">
        <span className="font-medium">Factura {invoice.fiscal_number}</span>
        <InvoiceMetadata invoice={invoice} />
        {invoice.fiscal_uuid === null ? null : (
          <span className="text-xs text-muted-foreground">
            Identificador fiscal: {invoice.fiscal_uuid}
          </span>
        )}
        {invoice.credit_notes.map((note) => (
          <CreditNoteRow key={note.id} invoiceId={invoice.id} note={note} />
        ))}
        {download.error === null ? null : <FormError error={download.error} />}
      </div>
      <Button
        type="button"
        variant="outline"
        disabled={download.pending}
        aria-label={`Descargar factura ${invoice.fiscal_number}`}
        onClick={() => {
          download.execute({
            path: `/v1/portal/invoices/${invoice.id}/link`,
            fileName: `${invoice.fiscal_number}.pdf`,
          });
        }}
      >
        {download.pending ? 'Preparando…' : 'Descargar factura'}
      </Button>
      {download.dialog}
    </li>
  );
}

function InvoiceMetadata({ invoice }: { readonly invoice: PortalInvoice }): JSX.Element {
  return (
    <span className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
      <span>{invoice.code}</span>
      <Badge>{STATUS_LABELS[invoice.status]}</Badge>
      <span>Emitida: {formatDate(invoice.issue_date)}</span>
      <span>Vence: {formatDate(invoice.due_date)}</span>
      <span className="font-medium text-foreground">{formatPesos(invoice.total)}</span>
    </span>
  );
}

function CreditNoteRow({
  invoiceId,
  note,
}: {
  readonly invoiceId: string;
  readonly note: PortalInvoice['credit_notes'][number];
}): JSX.Element {
  const download = usePortalDownload();
  return (
    <div className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
      <span>
        Nota crédito {note.fiscal_number} · {formatDate(note.issue_date)} ·{' '}
        {formatPesos(note.amount)}
      </span>
      <Button
        type="button"
        variant="outline"
        size="sm"
        disabled={download.pending}
        aria-label={`Descargar nota crédito ${note.fiscal_number}`}
        onClick={() => {
          download.execute({
            path: `/v1/portal/invoices/${invoiceId}/credit-notes/${note.id}/link`,
            fileName: `${note.fiscal_number}.pdf`,
          });
        }}
      >
        Descargar nota crédito
      </Button>
      {download.error === null ? null : <FormError error={download.error} />}
      {download.dialog}
    </div>
  );
}

export function PortalInvoicesPage(): JSX.Element {
  const invoices = usePortalInvoices();
  return (
    <>
      <PageHeader
        title="Facturas"
        description="Facturas emitidas a su empresa y sus soportes fiscales."
      />
      <QueryState query={invoices} loadingLabel="Cargando sus facturas">
        {(data) =>
          data.data.length === 0 ? (
            <EmptyState
              icon={<ReceiptText />}
              title="Aún no hay facturas emitidas"
              description="Aquí aparecerán sus facturas cuando el equipo registre el documento fiscal."
            />
          ) : (
            <Card>
              <CardContent className="p-4">
                <ul className="flex flex-col divide-y" aria-label="Facturas">
                  {data.data.map((invoice) => (
                    <InvoiceRow key={invoice.id} invoice={invoice} />
                  ))}
                </ul>
              </CardContent>
            </Card>
          )
        }
      </QueryState>
    </>
  );
}

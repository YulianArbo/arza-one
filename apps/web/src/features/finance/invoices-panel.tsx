'use client';

import { Card, CardContent, CardDescription, CardHeader, CardTitle, EmptyState } from '@arza/ui';
import { FileText } from 'lucide-react';
import { useState, type JSX } from 'react';

import { PageHeader } from '../../components/app-shell/page-header';
import { FormError } from '../access/form-alert';
import { QueryState } from '../administration/query-state';
import { RecordDialog } from '../organization/record-dialog';
import { InvoiceRow } from './invoice-row';
import { RequestInvoiceDialog } from './invoice-request-form';
import { useFinanceData } from './invoice-finance-data';

export function FinanceInvoicesPanel(): JSX.Element {
  const data = useFinanceData();
  const [created, setCreated] = useState(false);
  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        title="Facturas"
        description="Solicite facturas desde hitos y registre sus documentos fiscales y recaudos."
      />
      <InvoiceRequestCard data={data.milestones} created={created} setCreated={setCreated} />
      <InvoiceList query={data.invoices} />
    </div>
  );
}

function InvoiceRequestCard(props: {
  readonly data: ReturnType<typeof useFinanceData>['milestones'];
  readonly created: boolean;
  readonly setCreated: (created: boolean) => void;
}): JSX.Element {
  const empty = props.data.data?.data.length === 0;
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Solicitudes de factura</CardTitle>
        <CardDescription>
          El valor solicitado proviene del hito; los valores fiscales se registran desde el
          documento emitido.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        {props.data.isError ? <FormError error={props.data.error} /> : null}
        {empty ? (
          <EmptyState
            icon={<FileText />}
            title="No hay hitos listos para facturar"
            description="Cuando se acepten los entregables de un hito, aparecerá aquí."
          />
        ) : (
          <RequestInvoiceDialogButton onCreated={props.setCreated} />
        )}
        {props.created ? (
          <p role="status" className="text-sm text-muted-foreground">
            Solicitud registrada.
          </p>
        ) : null}
      </CardContent>
    </Card>
  );
}

function RequestInvoiceDialogButton({
  onCreated,
}: {
  readonly onCreated: (created: boolean) => void;
}): JSX.Element {
  return (
    <RecordDialog
      triggerLabel="Solicitar factura"
      title="Solicitar factura desde un hito"
      description="Seleccione un hito que Proyectos haya dejado listo para facturar."
    >
      {(close) => (
        <RequestInvoiceDialog
          onCreated={() => {
            onCreated(true);
            close();
          }}
        />
      )}
    </RecordDialog>
  );
}

function InvoiceList({
  query,
}: {
  readonly query: ReturnType<typeof useFinanceData>['invoices'];
}): JSX.Element {
  return (
    <QueryState query={query} loadingLabel="Cargando facturas">
      {(result) =>
        result.data.length === 0 ? (
          <EmptyState
            icon={<FileText />}
            title="Aún no hay facturas"
            description="Las solicitudes y documentos fiscales aparecerán aquí."
          />
        ) : (
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Facturas y solicitudes</CardTitle>
            </CardHeader>
            <CardContent className="p-4">
              <ul className="flex flex-col divide-y" aria-label="Facturas y solicitudes">
                {result.data.map((invoice) => (
                  <InvoiceRow key={invoice.id} invoice={invoice} />
                ))}
              </ul>
            </CardContent>
          </Card>
        )
      }
    </QueryState>
  );
}

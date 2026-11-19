'use client';

import {
  exportBatchListResponseSchema,
  financePeriodListResponseSchema,
  type ExportBatch,
  type FinancePeriod,
} from '@arza/contracts';
import { Badge, Button, Card, CardContent, CardHeader, CardTitle, SimpleTable } from '@arza/ui';
import { Download } from 'lucide-react';
import type { JSX } from 'react';

import { PageHeader } from '../../components/app-shell/page-header';
import { formatDateTime } from '../../lib/format/date-time';
import { useApiClient } from '../../lib/api/api-provider';
import type { DownloadedFile } from '../../lib/api/api-client';
import { FormError, FormSuccess } from '../access/form-alert';
import { QueryState } from '../administration/query-state';
import { save } from '../audit/audit-export-button';
import { formatPesos } from '../crm/labels';
import { usePermissions } from '../session/permissions';
import { ActionButton, monthLabel, useLedgerAction, useLedgerQuery } from './ledger-ui';

// Cierre de periodo y exportación contable (B32). Al cerrar un mes se genera su archivo definitivo
// y nada con fecha en ese mes vuelve a cambiar. Un mes abierto se exporta como preliminar. Formato
// pendiente de validación del Contador.

export function ClosingPanel(): JSX.Element {
  const periods = useLedgerQuery('/v1/finance/periods', financePeriodListResponseSchema);
  const { can } = usePermissions();
  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        title="Cierre y exportación contable"
        description="Cierre los meses terminados y entregue al Contador el archivo del mes (CSV, pendiente de validar su formato)."
      />
      <QueryState query={periods} loadingLabel="Cargando los meses">
        {(result) => <PeriodTable periods={result.data} />}
      </QueryState>
      {can('finance.export') ? <BatchList /> : null}
    </div>
  );
}

function PeriodTable({ periods }: { readonly periods: readonly FinancePeriod[] }): JSX.Element {
  return (
    <SimpleTable headers={['Mes', 'Estado', 'Gastos sin decidir', '']} caption="Meses contables">
      {periods.map((period) => (
        <tr key={period.period}>
          <td className="p-2 font-medium">{monthLabel(period.period)}</td>
          <td className="p-2">
            <Badge>{period.status === 'closed' ? 'Cerrado' : 'Abierto'}</Badge>
          </td>
          <td className="p-2">{period.pending_expenses}</td>
          <td className="p-2">
            <PeriodActions period={period} />
          </td>
        </tr>
      ))}
    </SimpleTable>
  );
}

function PeriodActions({ period }: { readonly period: FinancePeriod }): JSX.Element {
  const api = useApiClient();
  const { can } = usePermissions();
  return (
    <div className="flex flex-wrap gap-2">
      {period.closable && can('finance.period.close') ? (
        <ActionButton
          label="Cerrar mes"
          pendingLabel="Cerrando…"
          ariaLabel={`Cerrar mes ${monthLabel(period.period)}`}
          run={(csrfToken) =>
            api.post('/v1/finance/periods/close', { body: { period: period.period }, csrfToken })
          }
        />
      ) : null}
      {can('finance.export') ? <ExportButton period={period} /> : null}
    </div>
  );
}

function ExportButton({ period }: { readonly period: FinancePeriod }): JSX.Element {
  const api = useApiClient();
  const action = useLedgerAction<undefined, DownloadedFile>(
    (_args, csrfToken) =>
      api.download('/v1/finance/exports/accounting', {
        body: { period: period.period },
        csrfToken,
      }),
    save,
  );
  const kind = period.status === 'closed' ? 'definitivo' : 'preliminar';
  return (
    <div className="flex flex-col gap-1">
      <Button
        type="button"
        size="sm"
        variant="outline"
        aria-label={`Exportar ${kind} del mes ${monthLabel(period.period)}`}
        disabled={action.pending}
        onClick={() => {
          action.execute(undefined);
        }}
      >
        <Download aria-hidden="true" />
        {action.pending ? 'Exportando…' : `Exportar ${kind}`}
      </Button>
      <div aria-live="polite">
        {action.result === undefined ? null : (
          <FormSuccess message={`Descargamos ${action.result.fileName}.`} />
        )}
      </div>
      {action.error === null ? null : <FormError error={action.error} />}
      {action.dialog}
    </div>
  );
}

function BatchList(): JSX.Element {
  const batches = useLedgerQuery('/v1/finance/exports', exportBatchListResponseSchema);
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Archivos exportados</CardTitle>
      </CardHeader>
      <CardContent>
        <QueryState query={batches} loadingLabel="Cargando archivos">
          {(result) =>
            result.data.length === 0 ? (
              <p className="text-sm text-muted-foreground">Aún no se ha exportado ningún mes.</p>
            ) : (
              <BatchTable batches={result.data} />
            )
          }
        </QueryState>
      </CardContent>
    </Card>
  );
}

function BatchTable({ batches }: { readonly batches: readonly ExportBatch[] }): JSX.Element {
  return (
    <SimpleTable
      headers={[
        'Mes',
        'Tipo',
        'Movimientos',
        'Facturas',
        'Recaudos',
        'Gastos',
        'Caja menor',
        'Exportado',
      ]}
      caption="Lotes exportados con sus totales"
    >
      {batches.map((batch) => (
        <tr key={batch.id}>
          <td className="p-2">{monthLabel(batch.period)}</td>
          <td className="p-2">{batch.kind === 'definitive' ? 'Definitivo' : 'Preliminar'}</td>
          <td className="p-2">{batch.row_count}</td>
          <td className="p-2">{formatPesos(batch.totals.invoice)}</td>
          <td className="p-2">{formatPesos(batch.totals.payment)}</td>
          <td className="p-2">{formatPesos(batch.totals.expense)}</td>
          <td className="p-2">{formatPesos(batch.totals.petty_cash)}</td>
          <td className="p-2">{formatDateTime(batch.exported_at)}</td>
        </tr>
      ))}
    </SimpleTable>
  );
}

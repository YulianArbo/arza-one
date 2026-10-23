'use client';

import type { FunnelReport, FunnelRow } from '@arza/contracts';
import {
  Badge,
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  EmptyState,
  FormField,
  SimpleTable,
  TableCell,
  TableRow,
} from '@arza/ui';
import { ChartNoAxesColumn, Download } from 'lucide-react';
import { useState, type JSX, type SubmitEvent } from 'react';

import type { DownloadedFile } from '../../lib/api/api-client';
import { useApiClient } from '../../lib/api/api-provider';
import { formatDate } from '../../lib/format/date-time';
import { FormError, FormSuccess } from '../access/form-alert';
import { QueryState } from '../administration/query-state';
import { save } from '../audit/audit-export-button';
import { useCrmAction } from './crm-action';
import { OPPORTUNITY_STAGES, STAGE_TONES, formatPercent, formatPesos } from './labels';
import { useFunnel } from './queries';

// Informe del embudo, RE-COM-001 Registro de Oportunidades (B22): totales, etapas, motivos de
// pérdida y el registro, de las oportunidades creadas en el periodo. Se descarga en CSV.

interface Period {
  readonly from: string;
  readonly to: string;
}

const STATUS_LABELS: Readonly<Record<FunnelRow['status'], string>> = {
  open: 'Abierta',
  won: 'Ganada',
  lost: 'Perdida',
};

function PeriodFilter(props: { readonly onApply: (period: Period) => void }): JSX.Element {
  const [period, setPeriod] = useState<Period>({ from: '', to: '' });
  const submit = (event: SubmitEvent<HTMLFormElement>): void => {
    event.preventDefault();
    props.onApply(period);
  };
  return (
    <form onSubmit={submit} className="grid gap-3 sm:grid-cols-[12rem_12rem_auto] sm:items-end">
      <FormField
        id="informe-desde"
        label="Creadas desde"
        type="date"
        value={period.from}
        onChange={(event) => {
          setPeriod({ ...period, from: event.target.value });
        }}
      />
      <FormField
        id="informe-hasta"
        label="Hasta"
        type="date"
        value={period.to}
        onChange={(event) => {
          setPeriod({ ...period, to: event.target.value });
        }}
      />
      <Button type="submit" variant="outline">
        Ver
      </Button>
    </form>
  );
}

function Totals({ report }: { readonly report: FunnelReport }): JSX.Element {
  const { totals } = report;
  const tiles = [
    ['Abiertas', `${String(totals.open_count)} · ${formatPesos(totals.open_value)}`],
    ['Valor ponderado', formatPesos(totals.weighted_value)],
    ['Ganadas', `${String(totals.won_count)} · ${formatPesos(totals.won_value)}`],
    ['Perdidas', `${String(totals.lost_count)} · ${formatPesos(totals.lost_value)}`],
    ['Tasa de cierre', formatPercent(totals.win_rate)],
    [
      'Prospectos convertidos',
      `${String(totals.converted_leads)} de ${String(totals.leads_count)} (${formatPercent(totals.lead_conversion_rate)})`,
    ],
  ] as const;
  return (
    <dl className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
      {tiles.map(([term, value]) => (
        <div key={term} className="rounded-md border p-3">
          <dt className="text-xs text-muted-foreground">{term}</dt>
          <dd className="text-lg font-semibold tabular-nums">{value}</dd>
        </div>
      ))}
    </dl>
  );
}

function Stages({ report }: { readonly report: FunnelReport }): JSX.Element {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Por etapa</CardTitle>
      </CardHeader>
      <CardContent>
        <SimpleTable
          headers={['Etapa', 'Cantidad', 'Valor', 'Valor ponderado']}
          scrollLabel="Oportunidades por etapa"
        >
          {report.stages.map((stage) => (
            <TableRow key={stage.stage}>
              <TableCell>{stage.label}</TableCell>
              <TableCell className="tabular-nums">{stage.count}</TableCell>
              <TableCell className="tabular-nums">{formatPesos(stage.value)}</TableCell>
              <TableCell className="tabular-nums">{formatPesos(stage.weighted_value)}</TableCell>
            </TableRow>
          ))}
        </SimpleTable>
        {report.lost_reasons.length === 0 ? null : (
          <p className="mt-3 text-sm">
            Motivos de pérdida:{' '}
            {report.lost_reasons
              .map((reason) => `${reason.label} (${String(reason.count)})`)
              .join(', ')}
          </p>
        )}
      </CardContent>
    </Card>
  );
}

const ROW_HEADERS = [
  'Código',
  'Creada',
  'Cliente',
  'Oportunidad',
  'Etapa',
  'Valor',
  'Prob.',
  'Ponderado',
  'Cierre',
  'Responsable',
  'Estado',
];

function Rows({ rows }: { readonly rows: readonly FunnelRow[] }): JSX.Element {
  return (
    <SimpleTable headers={ROW_HEADERS} scrollLabel="Registro de oportunidades RE-COM-001">
      {rows.map((row) => (
        <TableRow key={row.code}>
          <TableCell>{row.code}</TableCell>
          <TableCell>{formatDate(row.created_on)}</TableCell>
          <TableCell>{row.client}</TableCell>
          <TableCell>{row.title}</TableCell>
          <TableCell>
            <Badge tone={STAGE_TONES[row.stage]}>{OPPORTUNITY_STAGES[row.stage]}</Badge>
          </TableCell>
          <TableCell className="tabular-nums">{formatPesos(row.estimated_value)}</TableCell>
          <TableCell className="tabular-nums">{row.probability} %</TableCell>
          <TableCell className="tabular-nums">{formatPesos(row.weighted_value)}</TableCell>
          <TableCell>{formatDate(row.expected_close)}</TableCell>
          <TableCell>{row.owner ?? '—'}</TableCell>
          <TableCell>
            {STATUS_LABELS[row.status]}
            {row.lost_reason === null ? '' : ` · ${row.lost_reason}`}
          </TableCell>
        </TableRow>
      ))}
    </SimpleTable>
  );
}

function ExportButton({ period }: { readonly period: Period }): JSX.Element {
  const api = useApiClient();
  const action = useCrmAction<Period, DownloadedFile>(
    (current, csrfToken) =>
      api.download('/v1/crm/reports/funnel/export', {
        body: {
          ...(current.from === '' ? {} : { from: current.from }),
          ...(current.to === '' ? {} : { to: current.to }),
        },
        csrfToken,
      }),
    save,
  );
  return (
    <div className="flex flex-col gap-2">
      <Button
        type="button"
        variant="outline"
        disabled={action.pending}
        onClick={() => {
          action.execute(period);
        }}
      >
        <Download aria-hidden="true" />
        {action.pending ? 'Descargando…' : 'Descargar RE-COM-001 (CSV)'}
      </Button>
      <div aria-live="polite">
        {action.result === undefined ? null : (
          <FormSuccess message={`Descargamos el archivo ${action.result.fileName}.`} />
        )}
      </div>
      {action.error === null ? null : <FormError error={action.error} />}
      {action.dialog}
    </div>
  );
}

export function FunnelReportPanel(): JSX.Element {
  const [period, setPeriod] = useState<Period>({ from: '', to: '' });
  const query = useFunnel({ from: period.from, to: period.to });
  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <PeriodFilter onApply={setPeriod} />
        <ExportButton period={period} />
      </div>
      <QueryState query={query} loadingLabel="Calculando el informe">
        {(report) =>
          report.rows.length === 0 ? (
            <EmptyState
              icon={<ChartNoAxesColumn />}
              title="No hay oportunidades en el periodo"
              description="Cambie las fechas o registre oportunidades en el embudo."
            />
          ) : (
            <>
              <Totals report={report} />
              <Stages report={report} />
              <Rows rows={report.rows} />
            </>
          )
        }
      </QueryState>
    </div>
  );
}

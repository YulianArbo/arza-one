'use client';

import {
  INDICATOR_FREQUENCIES,
  INDICATOR_SOURCES,
  INDICATOR_TRENDS,
  analyzeMeasurementSchema,
  calculateIndicatorSchema,
  indicatorSeriesResponseSchema,
  qmsCreatedResponseSchema,
  recordMeasurementSchema,
  type Indicator,
  type IndicatorMeasurement,
} from '@arza/contracts';
import { Badge, LineChart, PageHeader, SimpleTable, TableCell, TableRow } from '@arza/ui';
import type { JSX } from 'react';

import { useApiClient } from '../../lib/api/api-provider';
import { formatDate } from '../../lib/format/date-time';
import { QueryState } from '../administration/query-state';
import { HrDialogForm, HrSection, orNull } from '../hr/hr-dialog';
import { usePermissions } from '../session/permissions';
import { IndicatorForm, shownValue } from './quality-indicators';
import { QMS_REFRESH, useQmsQuery } from './quality-queries';

// Ficha, serie y tendencia de un indicador (B39). El responsable registra las mediciones manuales
// con su evidencia y escribe el análisis; Calidad puede calcular ahora uno automático.

function RecordMeasurement({ item }: { readonly item: Indicator }): JSX.Element | null {
  const api = useApiClient();
  const { can } = usePermissions();
  return (
    <HrDialogForm
      allowed={can('qms.indicator.measure') && item.source === 'manual' && item.active}
      label="Registrar medición"
      title={`Registrar la medición de ${item.code}`}
      description="Indique el primer día del periodo, el resultado, su análisis y de dónde sale el dato."
      fields={[
        {
          key: 'period_start',
          label: 'Primer día del periodo',
          type: 'date',
          value: item.pending_period ?? '',
        },
        { key: 'value', label: 'Resultado' },
        { key: 'analysis', label: 'Análisis' },
        { key: 'evidence_note', label: 'Evidencia' },
      ]}
      schema={recordMeasurementSchema}
      prepare={(values) => ({ ...values, evidence_file_id: null })}
      run={(body, csrfToken) =>
        api.post(`/v1/qms/indicators/${item.id}/measurements`, {
          body,
          csrfToken,
          schema: qmsCreatedResponseSchema,
        })
      }
      submitLabel="Registrar"
      refresh={QMS_REFRESH}
    />
  );
}

function CalculateNow({ item }: { readonly item: Indicator }): JSX.Element | null {
  const api = useApiClient();
  const { canAll } = usePermissions();
  return (
    <HrDialogForm
      allowed={canAll('qms.indicator.manage') && item.source !== 'manual'}
      label="Calcular ahora"
      title={`Calcular ${item.code}`}
      description="Deje la fecha vacía para calcular el último periodo cerrado."
      fields={[{ key: 'period_start', label: 'Primer día del periodo (opcional)', type: 'date' }]}
      schema={calculateIndicatorSchema}
      prepare={(values) => {
        const period = orNull(values['period_start']);
        return period === null ? {} : { period_start: period };
      }}
      run={(body, csrfToken) =>
        api.post(`/v1/qms/indicators/${item.id}/actions/calculate`, {
          body,
          csrfToken,
          schema: qmsCreatedResponseSchema,
        })
      }
      submitLabel="Calcular"
      refresh={QMS_REFRESH}
    />
  );
}

function Analyze(props: { readonly measurement: IndicatorMeasurement }): JSX.Element | null {
  const api = useApiClient();
  const { can } = usePermissions();
  const { measurement } = props;
  return (
    <HrDialogForm
      allowed={can('qms.indicator.measure')}
      label={`Analizar ${measurement.period}`}
      title={`Análisis de ${measurement.period}`}
      description="Explique el resultado y lo que se hará si no cumple."
      fields={[{ key: 'analysis', label: 'Análisis', value: measurement.analysis ?? '' }]}
      schema={analyzeMeasurementSchema}
      run={(body, csrfToken) =>
        api.patch(`/v1/qms/measurements/${measurement.id}`, {
          body,
          csrfToken,
          version: measurement.version,
        })
      }
      submitLabel="Guardar"
      refresh={QMS_REFRESH}
    />
  );
}

function Trend(props: {
  readonly item: Indicator;
  readonly data: readonly IndicatorMeasurement[];
}): JSX.Element {
  if (props.data.length === 0) {
    return <p className="text-muted-foreground">El indicador aún no tiene mediciones.</p>;
  }
  return (
    <LineChart
      title={`Tendencia de ${props.item.code}`}
      labels={props.data.map((item) => item.period)}
      series={[
        {
          key: 'resultado',
          label: 'Resultado',
          tone: 'action',
          values: props.data.map((item) => Number(item.value)),
        },
        {
          key: 'meta',
          label: 'Meta',
          tone: 'muted',
          values: props.data.map(() => Number(props.item.target)),
        },
      ]}
    />
  );
}

function Measurements(props: {
  readonly item: Indicator;
  readonly data: readonly IndicatorMeasurement[];
}): JSX.Element {
  return (
    <SimpleTable
      headers={['Periodo', 'Resultado', 'Cumple', 'Tendencia', 'Análisis', 'Registró', '']}
      scrollLabel="Mediciones"
    >
      {[...props.data].reverse().map((measurement) => (
        <TableRow key={measurement.id}>
          <TableCell>{measurement.period}</TableCell>
          <TableCell>{shownValue(measurement.value, props.item.unit)}</TableCell>
          <TableCell>
            <Badge tone={measurement.meets ? 'success' : 'destructive'}>
              {measurement.meets ? 'Cumple' : 'No cumple'}
            </Badge>
          </TableCell>
          <TableCell>
            {measurement.trend === null ? '—' : INDICATOR_TRENDS[measurement.trend]}
          </TableCell>
          <TableCell>{measurement.analysis ?? 'Sin análisis'}</TableCell>
          <TableCell>{measurement.measured_by?.name ?? 'La plataforma'}</TableCell>
          <TableCell>
            <Analyze measurement={measurement} />
          </TableCell>
        </TableRow>
      ))}
    </SimpleTable>
  );
}

function Sheet({ item }: { readonly item: Indicator }): JSX.Element {
  const rows: readonly (readonly [string, string])[] = [
    ['Proceso', item.process.name],
    ['Objetivo', item.objective],
    ['Fórmula', item.formula],
    ['Meta', shownValue(item.target, item.unit)],
    ['Frecuencia', INDICATOR_FREQUENCIES[item.frequency]],
    ['Fuente', INDICATOR_SOURCES[item.source]],
    ['Responsable', item.responsible.name],
  ];
  return (
    <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1">
      {rows.map(([label, value]) => (
        <div key={label} className="contents">
          <dt className="text-muted-foreground">{label}</dt>
          <dd>{value}</dd>
        </div>
      ))}
    </dl>
  );
}

export function QualityIndicatorDetail({ id }: { readonly id: string }): JSX.Element {
  const { canAll } = usePermissions();
  const path = canAll('qms.read')
    ? `/v1/qms/indicators/${id}/series`
    : `/v1/qms/my/indicators/${id}/series`;
  const query = useQmsQuery(path, indicatorSeriesResponseSchema);
  return (
    <QueryState query={query} loadingLabel="Cargando el indicador">
      {({ indicator, data }) => (
        <div className="flex flex-col gap-8">
          <PageHeader
            title={`${indicator.code} · ${indicator.name}`}
            description={indicator.objective}
          />
          <Sheet item={indicator} />
          {indicator.pending_period === null ? null : (
            <p role="status">
              Falta la medición del periodo que empezó el {formatDate(indicator.pending_period)}.
            </p>
          )}
          <div className="flex flex-wrap gap-3">
            <RecordMeasurement item={indicator} />
            <CalculateNow item={indicator} />
            <IndicatorForm item={indicator} />
          </div>
          <HrSection id="tendencia" title="Tendencia">
            <Trend item={indicator} data={data} />
          </HrSection>
          <HrSection id="mediciones" title="Mediciones">
            <Measurements item={indicator} data={data} />
          </HrSection>
        </div>
      )}
    </QueryState>
  );
}

'use client';

import {
  INDICATOR_DIRECTIONS,
  INDICATOR_FREQUENCIES,
  INDICATOR_SOURCES,
  INDICATOR_TRENDS,
  INDICATOR_UNITS,
  indicatorListResponseSchema,
  qmsCodeResponseSchema,
  saveIndicatorSchema,
  type Indicator,
} from '@arza/contracts';
import { Badge, Button, PageHeader, SimpleTable, TableCell, TableRow } from '@arza/ui';
import Link from 'next/link';
import type { JSX } from 'react';

import type { DownloadedFile } from '../../lib/api/api-client';
import { useApiClient } from '../../lib/api/api-provider';
import { FormError, FormSuccess } from '../access/form-alert';
import { QueryState } from '../administration/query-state';
import { save } from '../audit/audit-export-button';
import { HrDialogForm, HrSection, optionsOf } from '../hr/hr-dialog';
import type { HrField } from '../hr/hr-form';
import { useHrAction } from '../hr/hr-queries';
import { usePermissions } from '../session/permissions';
import { QMS_REFRESH, useQmsPeople, useQmsProcesses, useQmsQuery } from './quality-queries';

// Matriz de indicadores (B39; RE-SGC-006, decisión 10): por proceso, la meta, el último
// resultado, si cumple y su tendencia. Los automáticos los calcula la plataforma; los demás los
// registra su responsable con evidencia.

type Options = readonly { value: string; label: string }[];

const YES_NO = [
  { value: 'true', label: 'Sí' },
  { value: 'false', label: 'No' },
];

/** El valor con su unidad: «85 %», «3 días». */
export function shownValue(value: string, unit: Indicator['unit']): string {
  return unit === 'percent' ? `${value} %` : `${value} ${INDICATOR_UNITS[unit].toLowerCase()}`;
}

function sheetFields(processes: Options, people: Options, item?: Indicator): HrField[] {
  return [
    { key: 'process_id', label: 'Proceso', options: processes, value: item?.process.id ?? '' },
    { key: 'name', label: 'Nombre', value: item?.name ?? '' },
    { key: 'objective', label: 'Objetivo', value: item?.objective ?? '' },
    { key: 'formula', label: 'Fórmula', value: item?.formula ?? '' },
    {
      key: 'source',
      label: 'Fuente',
      options: optionsOf(INDICATOR_SOURCES),
      value: item?.source ?? 'manual',
    },
    { key: 'unit', label: 'Unidad', options: optionsOf(INDICATOR_UNITS), value: item?.unit ?? '' },
    { key: 'target', label: 'Meta', value: item?.target ?? '' },
    {
      key: 'direction',
      label: 'Sentido',
      options: optionsOf(INDICATOR_DIRECTIONS),
      value: item?.direction ?? 'higher_better',
    },
    {
      key: 'frequency',
      label: 'Frecuencia',
      options: optionsOf(INDICATOR_FREQUENCIES),
      value: item?.frequency ?? 'monthly',
    },
    {
      key: 'responsible_id',
      label: 'Responsable',
      options: people,
      value: item?.responsible.id ?? '',
    },
    { key: 'active', label: 'Activo', options: YES_NO, value: String(item?.active ?? true) },
  ];
}

export function IndicatorForm({ item }: { readonly item?: Indicator }): JSX.Element | null {
  const api = useApiClient();
  const { canAll } = usePermissions();
  const allowed = canAll('qms.indicator.manage');
  const processes = useQmsProcesses(allowed);
  const people = useQmsPeople(allowed);
  const editing = item !== undefined;
  return (
    <HrDialogForm
      allowed={allowed}
      label={editing ? 'Editar ficha' : 'Crear indicador'}
      title={editing ? `Editar ${item.code}` : 'Crear la ficha de un indicador'}
      description="Si la fuente es automática, la plataforma lo calcula al cerrar cada periodo."
      fields={sheetFields(processes, people, item)}
      schema={saveIndicatorSchema}
      prepare={(values) => ({ ...values, active: values['active'] !== 'false' })}
      run={(body, csrfToken) =>
        editing
          ? api.patch(`/v1/qms/indicators/${item.id}`, { body, csrfToken, version: item.version })
          : api.post('/v1/qms/indicators', { body, csrfToken, schema: qmsCodeResponseSchema })
      }
      submitLabel="Guardar"
      refresh={QMS_REFRESH}
    />
  );
}

function ResultCell({ item }: { readonly item: Indicator }): JSX.Element {
  const last = item.last;
  if (last === null) {
    return <TableCell className="text-muted-foreground">Sin medición</TableCell>;
  }
  return (
    <TableCell>
      <span className="flex flex-col gap-1">
        <span>
          {shownValue(last.value, item.unit)} · {last.period}
        </span>
        <Badge tone={last.meets ? 'success' : 'destructive'}>
          {last.meets ? 'Cumple' : 'No cumple'}
        </Badge>
      </span>
    </TableCell>
  );
}

function MatrixRow({ item }: { readonly item: Indicator }): JSX.Element {
  const trend = item.last?.trend ?? null;
  return (
    <TableRow>
      <TableCell>{item.process.name}</TableCell>
      <TableCell>
        <strong>{item.code}</strong> · {item.name}
        {item.active ? '' : ' (inactivo)'}
      </TableCell>
      <TableCell>
        {shownValue(item.target, item.unit)} · {INDICATOR_DIRECTIONS[item.direction].toLowerCase()}
      </TableCell>
      <ResultCell item={item} />
      <TableCell>{trend === null ? '—' : INDICATOR_TRENDS[trend]}</TableCell>
      <TableCell>{item.responsible.name}</TableCell>
      <TableCell>
        <Link className="text-sm underline" href={`/app/calidad/indicadores/${item.id}`}>
          Ver {item.code}
        </Link>
      </TableCell>
    </TableRow>
  );
}

/** Descarga la matriz en CSV; la descarga queda en la auditoría. */
function ExportMatrix(): JSX.Element {
  const api = useApiClient();
  const action = useHrAction<undefined, DownloadedFile>(
    (_input, csrfToken) => api.download('/v1/qms/indicators/export', { body: {}, csrfToken }),
    save,
  );
  return (
    <div className="flex flex-col gap-1">
      <Button
        type="button"
        variant="outline"
        disabled={action.pending}
        onClick={() => {
          action.execute(undefined);
        }}
      >
        {action.pending ? 'Descargando…' : 'Descargar matriz (CSV)'}
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

const MATRIX_HEADERS = [
  'Proceso',
  'Indicador',
  'Meta',
  'Último resultado',
  'Tendencia',
  'Responsable',
  '',
];

function Matrix({ data }: { readonly data: readonly Indicator[] }): JSX.Element {
  return (
    <SimpleTable headers={MATRIX_HEADERS} scrollLabel="Matriz de indicadores">
      {data.map((item) => (
        <MatrixRow key={item.id} item={item} />
      ))}
    </SimpleTable>
  );
}

export function QualityIndicators(): JSX.Element {
  const query = useQmsQuery('/v1/qms/indicators', indicatorListResponseSchema);
  return (
    <div className="flex flex-col gap-8">
      <PageHeader
        title="Indicadores"
        description="Matriz RE-SGC-006: meta, resultado y tendencia por proceso. Columnas por validar con el formato."
      />
      <div className="flex flex-wrap gap-3">
        <IndicatorForm />
        <ExportMatrix />
      </div>
      <HrSection id="matriz" title="Matriz de indicadores">
        <QueryState query={query} loadingLabel="Cargando la matriz">
          {({ data }) =>
            data.length === 0 ? (
              <p className="text-muted-foreground">Aún no hay indicadores.</p>
            ) : (
              <Matrix data={data} />
            )
          }
        </QueryState>
      </HrSection>
    </div>
  );
}

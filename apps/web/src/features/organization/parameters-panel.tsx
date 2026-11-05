'use client';

import {
  isWorkSchedule,
  weeklyHours,
  type ParameterSummary,
  type ParameterValue,
  type WorkSchedule,
} from '@arza/contracts';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  SimpleTable,
  TableCell,
  TableRow,
} from '@arza/ui';
import type { JSX } from 'react';

import { formatDate, formatDateTime } from '../../lib/format/date-time';
import { QueryState } from '../administration/query-state';
import { usePermissions } from '../session/permissions';
import { DiscountCapForm } from './discount-cap-form';
import { ScheduleForm } from './schedule-form';
import { useParameterHistory, useParameters } from './queries';
import { RecordDialog } from './record-dialog';

const DAY_NAMES = ['lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado', 'domingo'];

/** «lunes a viernes» si los días son seguidos; si no, la lista. */
export function describeDays(days: readonly number[]): string {
  const sorted = [...days].sort((a, b) => a - b);
  const names = sorted.map((day) => DAY_NAMES[day - 1] ?? '');
  const first = sorted[0];
  const last = sorted.at(-1);
  const consecutive =
    first !== undefined && last !== undefined && last - first === sorted.length - 1;
  if (consecutive && sorted.length > 2) return `${names[0] ?? ''} a ${names.at(-1) ?? ''}`;
  return names.join(', ');
}

/** Resumen del horario para la persona: días, jornadas y horas a la semana. */
export function describeSchedule(schedule: WorkSchedule): string {
  const { morning, afternoon } = schedule;
  const shifts = `${morning.start} a ${morning.end} y ${afternoon.start} a ${afternoon.end}`;
  return `De ${describeDays(schedule.days)}, ${shifts}: ${String(weeklyHours(schedule))} horas a la semana.`;
}

/** El valor en palabras: el horario o el tope de descuento. */
export function describeValue(value: ParameterValue): string {
  if (isWorkSchedule(value)) return describeSchedule(value);
  return `Hasta ${value.percent.replace(/\.00$/u, '').replace('.', ',')} % por ítem sin aprobación de la Dirección.`;
}

function ParameterHistory({ parameterKey }: { readonly parameterKey: string }): JSX.Element {
  const history = useParameterHistory(parameterKey);
  return (
    <QueryState query={history} loadingLabel="Cargando el historial">
      {(data) => (
        <SimpleTable
          caption="Historial de vigencias"
          headers={['Desde', 'Hasta', 'Valor', 'Registró']}
        >
          {data.data.map((version) => (
            <TableRow key={version.id}>
              <TableCell>{formatDate(version.valid_from)}</TableCell>
              <TableCell>
                {version.valid_to === null ? 'Sigue vigente' : formatDate(version.valid_to)}
              </TableCell>
              <TableCell>{describeValue(version.value)}</TableCell>
              <TableCell>
                {version.created_by?.name ?? 'El sistema'}
                <span className="block text-xs text-muted-foreground">
                  {formatDateTime(version.created_at)}
                </span>
              </TableCell>
            </TableRow>
          ))}
        </SimpleTable>
      )}
    </QueryState>
  );
}

function ParameterValues({ parameter }: { readonly parameter: ParameterSummary }): JSX.Element {
  const { current, scheduled } = parameter;
  return (
    <>
      <p>
        <span className="font-medium">Vigente hoy: </span>
        {current === null
          ? 'sin valor'
          : `${describeValue(current.value)} Desde el ${formatDate(current.valid_from)}.`}
      </p>
      {scheduled === null ? null : (
        <p>
          <span className="font-medium">Cambio programado: </span>
          {`${describeValue(scheduled.value)} Desde el ${formatDate(scheduled.valid_from)}.`}
        </p>
      )}
    </>
  );
}

/** El formulario de cada parámetro, según su valor. */
function ParameterForm(props: {
  readonly parameterKey: string;
  readonly initial: ParameterValue | null;
  readonly onSaved: () => void;
}): JSX.Element {
  if (props.parameterKey === 'work.schedule') {
    const initial = props.initial !== null && isWorkSchedule(props.initial) ? props.initial : null;
    return <ScheduleForm {...props} initial={initial} />;
  }
  const initial = props.initial !== null && !isWorkSchedule(props.initial) ? props.initial : null;
  return <DiscountCapForm {...props} initial={initial} />;
}

function ParameterCard({ parameter }: { readonly parameter: ParameterSummary }): JSX.Element {
  const canManage = usePermissions().can('core.parameter.manage');
  const { current, scheduled } = parameter;
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">{parameter.label}</CardTitle>
        <CardDescription>{parameter.description}</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <ParameterValues parameter={parameter} />
        {canManage ? (
          <div>
            <RecordDialog
              triggerLabel="Programar un cambio"
              title={`Cambiar el ${parameter.label.toLowerCase()}`}
              description="El valor actual no se borra: queda en el historial hasta el día anterior al cambio."
            >
              {(close) => (
                <ParameterForm
                  parameterKey={parameter.key}
                  initial={(scheduled ?? current)?.value ?? null}
                  onSaved={close}
                />
              )}
            </RecordDialog>
          </div>
        ) : null}
        <ParameterHistory parameterKey={parameter.key} />
      </CardContent>
    </Card>
  );
}

/** Parámetros con vigencia (ficha 17.1): nunca se sobrescriben. */
export function ParametersPanel(): JSX.Element {
  const parameters = useParameters();
  return (
    <QueryState query={parameters} loadingLabel="Cargando los parámetros">
      {(data) => (
        <div className="flex flex-col gap-6">
          {data.data.map((parameter) => (
            <ParameterCard key={parameter.key} parameter={parameter} />
          ))}
        </div>
      )}
    </QueryState>
  );
}

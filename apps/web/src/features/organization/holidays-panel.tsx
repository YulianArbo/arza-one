'use client';

import { businessDaysResponseSchema, createdResponseSchema, type Holiday } from '@arza/contracts';
import { Button, SelectField, SimpleTable, TableCell, TableRow } from '@arza/ui';
import { useState, type JSX, type SubmitEvent } from 'react';

import { ConfirmActionButton } from '../../components/confirm-action-button';
import { useApiClient } from '../../lib/api/api-provider';
import { formatDate } from '../../lib/format/date-time';
import { FormError } from '../access/form-alert';
import { useAdminAction } from '../administration/admin-action';
import { QueryState } from '../administration/query-state';
import { usePermissions } from '../session/permissions';
import { CORE_KEYS, useHolidays } from './queries';
import { TextInput } from './record-dialog';

const WEEKDAYS = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];

function weekday(date: string): string {
  return WEEKDAYS[new Date(`${date}T00:00:00Z`).getUTCDay()] ?? '';
}

function thisYear(): number {
  return Number(new Date(Date.now() - 5 * 3_600_000).toISOString().slice(0, 4));
}

function useHolidayActions(year: number) {
  const api = useApiClient();
  const invalidate = [CORE_KEYS.holidays(year)];
  const add = useAdminAction<{ date: string; name: string }, unknown>({
    run: (body, csrfToken) =>
      api.post('/v1/holidays', { body, schema: createdResponseSchema, csrfToken }),
    invalidate,
  });
  const remove = useAdminAction<Holiday>({
    run: (holiday, csrfToken) => api.delete(`/v1/holidays/${holiday.id}`, { csrfToken }),
    invalidate,
  });
  return { add, remove };
}

function AddHolidayForm(props: {
  readonly onAdd: (body: { date: string; name: string }) => void;
  readonly pending: boolean;
}): JSX.Element {
  const [date, setDate] = useState('');
  const [name, setName] = useState('');
  const submit = (event: SubmitEvent<HTMLFormElement>): void => {
    event.preventDefault();
    props.onAdd({ date, name: name.trim() });
  };
  return (
    <form
      noValidate
      onSubmit={submit}
      aria-label="Agregar un festivo"
      className="grid items-end gap-3 sm:grid-cols-[auto_1fr_auto]"
    >
      <TextInput id="festivo-fecha" label="Fecha" type="date" value={date} onValue={setDate} />
      <TextInput
        id="festivo-nombre"
        label="Nombre"
        hint="Por ejemplo, un día cívico decretado."
        value={name}
        onValue={setName}
      />
      <Button type="submit" disabled={props.pending}>
        {props.pending ? 'Agregando…' : 'Agregar el festivo'}
      </Button>
    </form>
  );
}

function HolidayRow(props: {
  readonly holiday: Holiday;
  readonly canManage: boolean;
  readonly onRemove: (holiday: Holiday) => void;
}) {
  const { holiday } = props;
  return (
    <TableRow>
      <TableCell>{formatDate(holiday.date)}</TableCell>
      <TableCell className="capitalize">{weekday(holiday.date)}</TableCell>
      <TableCell>{holiday.name}</TableCell>
      <TableCell>
        {props.canManage ? (
          <ConfirmActionButton
            label="Quitar"
            title={`¿Quitar el festivo del ${formatDate(holiday.date)}?`}
            description="Ese día volverá a contar como día hábil en los plazos."
            confirmLabel="Sí, quitar"
            disabled={false}
            onConfirm={() => {
              props.onRemove(holiday);
            }}
          />
        ) : null}
      </TableCell>
    </TableRow>
  );
}

function useDeadline() {
  const api = useApiClient();
  const [result, setResult] = useState<string | null>(null);
  const [error, setError] = useState<unknown>(null);
  const calculate = (from: string, days: string): void => {
    const path = `/v1/business-days?${new URLSearchParams({ from, days }).toString()}`;
    api.get(path, { schema: businessDaysResponseSchema }).then(
      (response) => {
        setResult(response.date);
        setError(null);
      },
      (failure: unknown) => {
        setResult(null);
        setError(failure);
      },
    );
  };
  return { result, error, calculate };
}

function DeadlineInputs(props: {
  readonly from: string;
  readonly days: string;
  readonly onFrom: (from: string) => void;
  readonly onDays: (days: string) => void;
}): JSX.Element {
  return (
    <div className="grid items-end gap-3 sm:grid-cols-[auto_auto_auto]">
      <TextInput
        id="plazo-desde"
        label="Fecha de partida"
        type="date"
        value={props.from}
        onValue={props.onFrom}
      />
      <TextInput
        id="plazo-dias"
        label="Días hábiles"
        type="number"
        min={1}
        max={365}
        value={props.days}
        onValue={props.onDays}
      />
      <Button type="submit" variant="outline">
        Calcular
      </Button>
    </div>
  );
}

/** Calcula en qué fecha vence un plazo en días hábiles, con los festivos y el horario vigente. */
function DeadlineCalculator(): JSX.Element {
  const [from, setFrom] = useState('');
  const [days, setDays] = useState('15');
  const deadline = useDeadline();
  const submit = (event: SubmitEvent<HTMLFormElement>): void => {
    event.preventDefault();
    deadline.calculate(from, days);
  };
  const { result } = deadline;
  return (
    <form
      noValidate
      onSubmit={submit}
      aria-label="Calcular un vencimiento"
      className="flex flex-col gap-3"
    >
      {deadline.error === null ? null : <FormError error={deadline.error} />}
      <DeadlineInputs from={from} days={days} onFrom={setFrom} onDays={setDays} />
      <p role="status" className="text-sm font-medium">
        {result === null ? '' : `El plazo vence el ${weekday(result)} ${formatDate(result)}.`}
      </p>
    </form>
  );
}

function HolidayList(props: { readonly year: number; readonly canManage: boolean }): JSX.Element {
  const holidays = useHolidays(props.year);
  const { add, remove } = useHolidayActions(props.year);
  const failure = add.error ?? remove.error;
  return (
    <>
      {failure ? <FormError error={failure} /> : null}
      {props.canManage ? <AddHolidayForm onAdd={add.execute} pending={add.pending} /> : null}
      <QueryState query={holidays} loadingLabel="Cargando los festivos">
        {(data) => (
          <SimpleTable
            caption={`${String(data.data.length)} festivos en ${String(props.year)}`}
            headers={['Fecha', 'Día', 'Festivo', '']}
          >
            {data.data.map((holiday) => (
              <HolidayRow
                key={holiday.id}
                holiday={holiday}
                canManage={props.canManage}
                onRemove={remove.execute}
              />
            ))}
          </SimpleTable>
        )}
      </QueryState>
    </>
  );
}

/** Festivos de un año y calculadora de días hábiles (ficha 17.1). */
export function HolidaysPanel(): JSX.Element {
  const [year, setYear] = useState(thisYear());
  const canManage = usePermissions().can('core.parameter.manage');
  const years = [year - 1, year, year + 1, year + 2].map((y) => ({
    value: String(y),
    label: String(y),
  }));
  return (
    <div className="flex flex-col gap-8">
      <section aria-labelledby="festivos-titulo" className="flex flex-col gap-4">
        <h2 id="festivos-titulo" className="text-lg font-semibold">
          Festivos
        </h2>
        <div className="max-w-40">
          <SelectField
            id="festivos-ano"
            label="Año"
            options={years}
            value={String(year)}
            onChange={(e) => {
              setYear(Number(e.target.value));
            }}
          />
        </div>
        {/* La lista cambia de clave con el año: sus acciones recargan el año que se ve. */}
        <HolidayList key={year} year={year} canManage={canManage} />
      </section>
      <section aria-labelledby="plazos-titulo" className="flex flex-col gap-4">
        <h2 id="plazos-titulo" className="text-lg font-semibold">
          Calcular un plazo en días hábiles
        </h2>
        <DeadlineCalculator />
      </section>
    </div>
  );
}

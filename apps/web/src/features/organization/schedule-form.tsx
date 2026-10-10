'use client';

import { workScheduleSchema, weeklyHours, type WorkSchedule } from '@arza/contracts';
import { DialogFooter } from '@arza/ui';
import { useState, type JSX, type SubmitEvent } from 'react';

import { useApiClient } from '../../lib/api/api-provider';
import { FormError } from '../access/form-alert';
import { FormField } from '../access/form-field';
import { SubmitButton } from '../access/submit-button';
import { useAdminAction } from '../administration/admin-action';
import { CORE_KEYS } from './queries';
import { TextInput } from './record-dialog';

const DAYS = ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo'];

const DEFAULT: WorkSchedule = {
  days: [1, 2, 3, 4, 5],
  morning: { start: '08:00', end: '12:00' },
  afternoon: { start: '13:00', end: '17:00' },
};

/** Mañana en Colombia (UTC−5), el primer día que se suele programar. */
function tomorrowInBogota(): string {
  return new Date(Date.now() - 5 * 3_600_000 + 86_400_000).toISOString().slice(0, 10);
}

interface Submission {
  readonly value: WorkSchedule;
  readonly validFrom: string;
}

function useSaveVersion(parameterKey: string, onSaved: () => void) {
  const api = useApiClient();
  return useAdminAction<Submission>({
    run: ({ value, validFrom }, csrfToken) =>
      api.post(`/v1/parameters/${parameterKey}/versions`, {
        body: { value, valid_from: validFrom },
        csrfToken,
      }),
    invalidate: [CORE_KEYS.parameters, CORE_KEYS.parameterHistory(parameterKey)],
    onSuccess: onSaved,
  });
}

function DayChoices(props: {
  readonly days: readonly number[];
  readonly onChange: (days: number[]) => void;
}): JSX.Element {
  const toggle = (day: number): void => {
    const { days } = props;
    props.onChange(
      days.includes(day) ? days.filter((d) => d !== day) : [...days, day].sort((a, b) => a - b),
    );
  };
  return (
    <fieldset className="flex flex-col gap-2">
      <legend className="mb-1 text-sm font-medium">Días laborales</legend>
      <div className="grid grid-cols-2 gap-1 sm:grid-cols-4">
        {DAYS.map((name, index) => (
          <label key={name} className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={props.days.includes(index + 1)}
              onChange={() => {
                toggle(index + 1);
              }}
            />
            {name}
          </label>
        ))}
      </div>
    </fieldset>
  );
}

function ShiftFields(props: {
  readonly id: string;
  readonly label: string;
  readonly shift: { readonly start: string; readonly end: string };
  readonly onChange: (shift: { start: string; end: string }) => void;
}): JSX.Element {
  const { shift, onChange } = props;
  return (
    <fieldset className="grid grid-cols-2 gap-3">
      <legend className="mb-1 text-sm font-medium">{props.label}</legend>
      <FormField
        id={`${props.id}-desde`}
        label="Desde"
        type="time"
        value={shift.start}
        onChange={(e) => {
          onChange({ ...shift, start: e.target.value });
        }}
      />
      <FormField
        id={`${props.id}-hasta`}
        label="Hasta"
        type="time"
        value={shift.end}
        onChange={(e) => {
          onChange({ ...shift, end: e.target.value });
        }}
      />
    </fieldset>
  );
}

function ScheduleFields(props: {
  readonly value: WorkSchedule;
  readonly onChange: (value: WorkSchedule) => void;
}): JSX.Element {
  const { value, onChange } = props;
  const valid = workScheduleSchema.safeParse(value);
  return (
    <>
      <DayChoices
        days={value.days}
        onChange={(days) => {
          onChange({ ...value, days });
        }}
      />
      <ShiftFields
        id="manana"
        label="Jornada de la mañana"
        shift={value.morning}
        onChange={(morning) => {
          onChange({ ...value, morning });
        }}
      />
      <ShiftFields
        id="tarde"
        label="Jornada de la tarde"
        shift={value.afternoon}
        onChange={(afternoon) => {
          onChange({ ...value, afternoon });
        }}
      />
      <p role="status" className="text-sm">
        {valid.success
          ? `Total: ${String(weeklyHours(value))} horas a la semana.`
          : (valid.error.issues[0]?.message ?? 'Revise el horario.')}
      </p>
    </>
  );
}

/** Programa una vigencia nueva del horario laboral; la actual se conserva en el historial. */
export function ScheduleForm(props: {
  readonly parameterKey: string;
  readonly initial: WorkSchedule | null;
  readonly onSaved: () => void;
}): JSX.Element {
  const [value, setValue] = useState<WorkSchedule>(props.initial ?? DEFAULT);
  const [validFrom, setValidFrom] = useState(tomorrowInBogota());
  const save = useSaveVersion(props.parameterKey, props.onSaved);
  const submit = (event: SubmitEvent<HTMLFormElement>): void => {
    event.preventDefault();
    if (workScheduleSchema.safeParse(value).success) save.execute({ value, validFrom });
  };
  return (
    <form noValidate onSubmit={submit} className="flex flex-col gap-4">
      {save.error === null ? null : <FormError error={save.error} />}
      <ScheduleFields value={value} onChange={setValue} />
      <TextInput
        id="vigencia-desde"
        label="Rige desde"
        type="date"
        hint="Hoy o más adelante; después del último cambio programado."
        value={validFrom}
        onValue={setValidFrom}
      />
      <DialogFooter>
        <SubmitButton
          label="Programar el cambio"
          pendingLabel="Guardando…"
          pending={save.pending}
        />
      </DialogFooter>
      {save.dialog}
    </form>
  );
}

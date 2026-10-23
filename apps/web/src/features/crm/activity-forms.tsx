'use client';

import {
  activityTypeSchema,
  createdResponseSchema,
  createCrmActivityRequestSchema,
  type CrmActivity,
} from '@arza/contracts';
import { DialogFooter, SelectField, TextareaField } from '@arza/ui';
import { useState, type JSX, type SubmitEvent } from 'react';

import { useApiClient } from '../../lib/api/api-provider';
import { FormError } from '../access/form-alert';
import { SubmitButton } from '../access/submit-button';
import { useCrmAction } from './crm-action';
import { ACTIVITY_TYPES, optionsOf } from './labels';
import { TextFields, type TextFieldSpec } from './text-fields';

// Agendar una actividad y marcarla hecha (B22). La hora se escribe en hora de Colombia y se envía
// en UTC; el responsable recibe el recordatorio 30 minutos antes.

const TYPE_OPTIONS = optionsOf(activityTypeSchema.options, ACTIVITY_TYPES);

/** Registro al que pertenece la actividad nueva. */
export interface ActivityTarget {
  readonly leadId: string | null;
  readonly opportunityId: string | null;
}

interface NewActivity {
  readonly type: string;
  readonly subject: string;
  readonly notes: string;
  /** «AAAA-MM-DDTHH:MM» del campo de fecha y hora, en hora de Colombia. */
  readonly dueLocal: string;
}

const EMPTY: NewActivity = { type: 'call', subject: '', notes: '', dueLocal: '' };

/** «2026-10-22T15:30» de Colombia (UTC−5) → instante ISO. */
export function bogotaInstant(local: string): string | null {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/u.test(local)) return null;
  return new Date(`${local}:00-05:00`).toISOString();
}

function bodyOf(target: ActivityTarget, values: NewActivity) {
  return {
    lead_id: target.leadId,
    opportunity_id: target.opportunityId,
    type: values.type,
    subject: values.subject.trim(),
    notes: values.notes.trim() === '' ? null : values.notes.trim(),
    due_at: bogotaInstant(values.dueLocal),
  };
}

/** Problemas por campo, con el mismo esquema que usa la API. */
function activityProblems(target: ActivityTarget, values: NewActivity): Record<string, string> {
  const result = createCrmActivityRequestSchema.safeParse(bodyOf(target, values));
  if (result.success) return {};
  const problems: Record<string, string> = {};
  for (const issue of result.error.issues) {
    const field = String(issue.path[0] ?? '');
    problems[field] ??=
      field === 'due_at' ? 'Elija el día y la hora.' : 'Escriba al menos tres letras.';
  }
  return problems;
}

const FIELDS: readonly TextFieldSpec<'subject' | 'dueLocal'>[] = [
  { key: 'subject', field: 'subject', id: 'actividad-asunto', label: 'Asunto' },
  {
    key: 'dueLocal',
    field: 'due_at',
    id: 'actividad-hora',
    label: 'Día y hora (hora de Colombia)',
    type: 'datetime-local',
    hint: 'Le llegará un recordatorio 30 minutos antes.',
  },
];

function ActivityFields(props: {
  readonly values: NewActivity;
  readonly problems: Record<string, string>;
  readonly onChange: (values: NewActivity) => void;
}): JSX.Element {
  const { values } = props;
  const set = (key: keyof NewActivity, text: string): void => {
    props.onChange({ ...values, [key]: text });
  };
  return (
    <>
      <SelectField
        id="actividad-tipo"
        label="Tipo"
        options={TYPE_OPTIONS}
        value={values.type}
        onChange={(event) => {
          set('type', event.target.value);
        }}
      />
      <TextFields specs={FIELDS} values={values} problems={props.problems} onChange={set} />
      <TextareaField
        id="actividad-notas"
        label="Notas (opcional)"
        value={values.notes}
        maxLength={2000}
        onChange={(event) => {
          set('notes', event.target.value);
        }}
      />
    </>
  );
}

function useNewActivity(target: ActivityTarget, onDone: () => void) {
  const api = useApiClient();
  const [values, setValues] = useState(EMPTY);
  const [problems, setProblems] = useState<Record<string, string>>({});
  const save = useCrmAction<NewActivity, string>(async (current, csrfToken) => {
    const options = { body: bodyOf(target, current), schema: createdResponseSchema, csrfToken };
    return (await api.post('/v1/crm/activities', options)).id;
  }, onDone);
  const submit = (event: SubmitEvent<HTMLFormElement>): void => {
    event.preventDefault();
    const found = activityProblems(target, values);
    setProblems(found);
    if (Object.keys(found).length === 0) save.execute(values);
  };
  return { values, setValues, problems, save, submit };
}

export function NewActivityForm(props: {
  readonly target: ActivityTarget;
  readonly onDone: () => void;
}): JSX.Element {
  const form = useNewActivity(props.target, props.onDone);
  return (
    <form noValidate onSubmit={form.submit} className="flex flex-col gap-4">
      {form.save.error === null ? null : <FormError error={form.save.error} />}
      <ActivityFields values={form.values} problems={form.problems} onChange={form.setValues} />
      <DialogFooter>
        <SubmitButton label="Agendar" pendingLabel="Agendando…" pending={form.save.pending} />
      </DialogFooter>
      {form.save.dialog}
    </form>
  );
}

function useComplete(activity: CrmActivity, onDone: () => void) {
  const api = useApiClient();
  const [outcome, setOutcome] = useState('');
  const [problem, setProblem] = useState<string | null>(null);
  const save = useCrmAction<string>(
    (current, csrfToken) =>
      api.post(`/v1/crm/activities/${activity.id}/actions/complete`, {
        body: { outcome: current },
        version: activity.version,
        csrfToken,
      }),
    onDone,
  );
  const submit = (event: SubmitEvent<HTMLFormElement>): void => {
    event.preventDefault();
    const text = outcome.trim();
    setProblem(text.length < 3 ? 'Escriba qué pasó (al menos tres letras).' : null);
    if (text.length >= 3) save.execute(text);
  };
  return { outcome, setOutcome, problem, save, submit };
}

export function CompleteActivityForm(props: {
  readonly activity: CrmActivity;
  readonly onDone: () => void;
}): JSX.Element {
  const form = useComplete(props.activity, props.onDone);
  return (
    <form noValidate onSubmit={form.submit} className="flex flex-col gap-4">
      {form.save.error === null ? null : <FormError error={form.save.error} />}
      <TextareaField
        id={`resultado-${props.activity.id}`}
        label="Resultado"
        value={form.outcome}
        maxLength={2000}
        error={form.problem}
        onChange={(event) => {
          form.setOutcome(event.target.value);
        }}
      />
      <DialogFooter>
        <SubmitButton label="Marcar hecha" pendingLabel="Guardando…" pending={form.save.pending} />
      </DialogFooter>
      {form.save.dialog}
    </form>
  );
}

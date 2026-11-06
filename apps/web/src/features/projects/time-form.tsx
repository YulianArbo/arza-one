'use client';

import { TIME_RULES } from '@arza/contracts';
import type { JSX } from 'react';

import { useApiClient } from '../../lib/api/api-provider';
import {
  CheckField,
  ChoiceFields,
  DialogForm,
  Fields,
  decimal,
  optional,
  useDialogForm,
  type ChoiceSpec,
  type FieldSpec,
} from './form-bits';
import { itemLabel } from './labels';
import { useProjectAction } from './queries';

// Registrar horas (B27, ficha 17.8): el día, las horas en cuartos de hora, el ítem (o trabajo
// general del proyecto), si se cobran al cliente y qué se hizo. Máximo siete días de atraso; la API
// revisa además que la persona no pase de 24 horas en el día.

export interface LoggableProject {
  readonly id: string;
  readonly label: string;
  readonly items: readonly {
    readonly id: string;
    readonly number: number;
    readonly title: string;
  }[];
}

interface Values {
  readonly projectId: string;
  readonly workDate: string;
  readonly hours: string;
  readonly itemId: string;
  readonly note: string;
  readonly billable: boolean;
}

interface Range {
  readonly earliest: string;
  readonly today: string;
}

const TEXTS: readonly FieldSpec<'workDate' | 'hours' | 'note'>[] = [
  {
    key: 'workDate',
    field: 'work_date',
    id: 'horas-dia',
    label: 'Día trabajado',
    type: 'date',
    hint: 'Hoy o hasta siete días atrás.',
  },
  {
    key: 'hours',
    field: 'hours',
    id: 'horas-cantidad',
    label: 'Horas',
    inputMode: 'decimal',
    hint: 'En cuartos de hora, como 1,5.',
  },
  { key: 'note', field: 'note', id: 'horas-nota', label: 'Qué hizo' },
];

function hoursProblem(text: string): string | null {
  const hours = decimal(text);
  const quarters = hours / TIME_RULES.step;
  if (Number.isNaN(hours) || hours <= 0 || hours > TIME_RULES.maxPerDay) {
    return 'Escriba entre 0,25 y 24 horas.';
  }
  return Math.abs(quarters - Math.round(quarters)) > 1e-6
    ? 'Use cuartos de hora: 0,25 · 0,5 · 0,75 · 1…'
    : null;
}

function problemsOf(values: Values, range: Range): Record<string, string> {
  const found: Record<string, string> = {};
  if (values.projectId === '') found['project'] = 'Elija el proyecto.';
  if (values.workDate === '' || values.workDate > range.today) {
    found['work_date'] = 'Elija un día que ya pasó o el de hoy.';
  } else if (values.workDate < range.earliest) {
    found['work_date'] = 'Las horas se registran máximo con siete días de atraso.';
  }
  const hours = hoursProblem(values.hours);
  if (hours !== null) found['hours'] = hours;
  return found;
}

function choicesOf(
  projects: readonly LoggableProject[],
  projectId: string,
): ChoiceSpec<'projectId' | 'itemId'>[] {
  const items = projects.find((project) => project.id === projectId)?.items ?? [];
  const project: ChoiceSpec<'projectId'> = {
    key: 'projectId',
    field: 'project',
    id: 'horas-proyecto',
    label: 'Proyecto',
    options: [
      { value: '', label: 'Elija el proyecto' },
      ...projects.map((row) => ({ value: row.id, label: row.label })),
    ],
  };
  const item: ChoiceSpec<'itemId'> = {
    key: 'itemId',
    field: 'item_id',
    id: 'horas-item',
    label: 'Ítem',
    options: [
      { value: '', label: 'Trabajo general del proyecto' },
      ...items.map((row) => ({ value: row.id, label: itemLabel(row) })),
    ],
  };
  return projects.length === 1 ? [item] : [project, item];
}

function initialOf(projects: readonly LoggableProject[], today: string): Values {
  const only = projects.length === 1 ? (projects[0]?.id ?? '') : '';
  return { projectId: only, workDate: today, hours: '', itemId: '', note: '', billable: true };
}

function bodyOf(values: Values): object {
  return {
    work_date: values.workDate,
    hours: decimal(values.hours),
    item_id: values.itemId === '' ? null : values.itemId,
    billable: values.billable,
    note: optional(values.note),
  };
}

interface FormProps {
  readonly projects: readonly LoggableProject[];
  readonly earliest: string;
  readonly today: string;
  readonly onDone: () => void;
}

function useTimeForm(props: FormProps) {
  const api = useApiClient();
  const log = useProjectAction<{ projectId: string; body: object }>(async (args, csrfToken) => {
    await api.post(`/v1/projects/${args.projectId}/time-entries`, { body: args.body, csrfToken });
  }, props.onDone);
  const form = useDialogForm(
    initialOf(props.projects, props.today),
    (values) => problemsOf(values, props),
    (values) => {
      log.execute({ projectId: values.projectId, body: bodyOf(values) });
    },
  );
  return { log, form };
}

export function TimeForm(props: FormProps): JSX.Element {
  const { log, form } = useTimeForm(props);
  const change = (key: string, value: string): void => {
    form.set(key === 'projectId' ? { projectId: value, itemId: '' } : { [key]: value });
  };
  const choices = choicesOf(props.projects, form.values.projectId);
  return (
    <DialogForm
      problems={form.problems}
      fields={[...choices, ...TEXTS]}
      action={log}
      submitLabel="Registrar"
      onSubmit={form.submit}
    >
      <ChoiceFields
        specs={choices}
        values={form.values}
        problems={form.problems}
        onChange={change}
      />
      <Fields specs={TEXTS} values={form.values} problems={form.problems} onChange={change} />
      <CheckField
        id="horas-cobrable"
        label="Se cobra al cliente"
        checked={form.values.billable}
        onChange={(billable) => {
          form.set({ billable });
        }}
      />
    </DialogForm>
  );
}

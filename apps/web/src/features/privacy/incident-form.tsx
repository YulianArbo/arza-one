'use client';

import { createPrivacyIncidentSchema, dataCategorySchema } from '@arza/contracts';
import { useRouter } from 'next/navigation';
import type { JSX } from 'react';

import {
  CheckField,
  DialogForm,
  Fields,
  useDialogForm,
  type FieldSpec,
} from '../projects/form-bits';
import { B42_PATHS, DATA_CATEGORY_TEXT } from './request-labels';
import { useCreateIncident } from './request-queries';

// Registro de un incidente con datos personales (B42, decisión 9): la fecha límite de 15 días
// hábiles para reportarlo a la SIC se calcula desde la detección.

type Key = 'title' | 'description' | 'detectedAt' | 'affected' | 'projectRef';

interface Values extends Record<Key, string> {
  readonly categories: readonly string[];
}

const SPECS: readonly FieldSpec<Key>[] = [
  { key: 'title', field: 'title', id: 'incidente-titulo', label: 'Qué pasó, en una frase' },
  {
    key: 'description',
    field: 'description',
    id: 'incidente-descripcion',
    label: 'Descripción',
    hint: 'Cómo se detectó, qué sistemas afectó y qué datos se expusieron.',
    multiline: true,
  },
  {
    key: 'detectedAt',
    field: 'detected_at',
    id: 'incidente-detectado',
    label: 'Cuándo se detectó',
    type: 'datetime-local',
  },
  {
    key: 'affected',
    field: 'affected_count',
    id: 'incidente-afectados',
    label: 'Titulares afectados (aproximado)',
    inputMode: 'numeric',
  },
  {
    key: 'projectRef',
    field: 'project_incident_ref',
    id: 'incidente-proyecto',
    label: 'Código del incidente en Proyectos (opcional)',
  },
];

const SUMMARY = [
  ...SPECS.map((spec) => ({ field: spec.field, id: spec.id, label: spec.label })),
  { field: 'data_categories', id: 'incidente-tipos', label: 'Tipos de datos' },
];

function bodyOf(values: Values): unknown {
  const detected = values.detectedAt === '' ? '' : new Date(values.detectedAt).toISOString();
  return {
    title: values.title,
    description: values.description,
    detected_at: detected,
    affected_count: Number(values.affected === '' ? Number.NaN : values.affected),
    data_categories: values.categories,
    project_incident_ref: values.projectRef.trim() === '' ? null : values.projectRef.trim(),
  };
}

function problemsOf(values: Values): Record<string, string> {
  const parsed = createPrivacyIncidentSchema.safeParse(bodyOf(values));
  if (parsed.success) return {};
  const found: Record<string, string> = {};
  for (const issue of parsed.error.issues) found[String(issue.path[0] ?? '')] ??= issue.message;
  return found;
}

function Categories(props: {
  readonly value: readonly string[];
  readonly error: string | undefined;
  readonly onValue: (value: string[]) => void;
}): JSX.Element {
  return (
    <fieldset id="incidente-tipos" className="flex flex-col gap-2">
      <legend className="text-sm font-medium">Tipos de datos comprometidos</legend>
      <div className="grid gap-2 sm:grid-cols-2">
        {dataCategorySchema.options.map((category) => (
          <CheckField
            key={category}
            id={`incidente-tipo-${category}`}
            label={DATA_CATEGORY_TEXT[category] ?? category}
            checked={props.value.includes(category)}
            onChange={(checked) => {
              const rest = props.value.filter((item) => item !== category);
              props.onValue(checked ? [...rest, category] : rest);
            }}
          />
        ))}
      </div>
      {props.error === undefined ? null : <p className="text-sm text-destructive">{props.error}</p>}
    </fieldset>
  );
}

export function IncidentForm(): JSX.Element {
  const router = useRouter();
  const create = useCreateIncident((id) => {
    router.push(B42_PATHS.incident(id));
  });
  const form = useDialogForm<Values>(
    { title: '', description: '', detectedAt: '', affected: '', projectRef: '', categories: [] },
    problemsOf,
    (values) => {
      create.execute(createPrivacyIncidentSchema.parse(bodyOf(values)));
    },
  );
  return (
    <DialogForm
      problems={form.problems}
      fields={SUMMARY}
      action={create}
      submitLabel="Registrar"
      onSubmit={form.submit}
    >
      <Fields
        specs={SPECS}
        values={form.values}
        problems={form.problems}
        onChange={(key, value) => {
          form.set({ [key]: value });
        }}
      />
      <Categories
        value={form.values.categories}
        error={form.problems['data_categories']}
        onValue={(categories) => {
          form.set({ categories });
        }}
      />
    </DialogForm>
  );
}

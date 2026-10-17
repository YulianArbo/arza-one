'use client';

import {
  createActivityRequestSchema,
  dataCategorySchema,
  holderTypeSchema,
  type Activity,
  type DataCategory,
  type HolderType,
} from '@arza/contracts';
import { useState, type JSX, type SubmitEvent } from 'react';

import { FormError } from '../access/form-alert';
import { SubmitButton } from '../access/submit-button';
import { CheckboxField, TextInput } from '../organization/record-dialog';
import { DATA_CATEGORY_LABELS, HOLDER_TYPE_LABELS } from './labels';
import { useProcessors, useSaveActivity } from './queries';

// Formulario de una actividad de tratamiento (B17): qué datos, de quiénes, para qué, con qué
// fundamento, por cuánto tiempo y con qué encargados.

interface ActivityValues {
  readonly name: string;
  readonly purpose: string;
  readonly dataCategories: readonly DataCategory[];
  readonly holderTypes: readonly HolderType[];
  readonly legalBasis: string;
  readonly retention: string;
  readonly transfers: string;
  readonly processorIds: readonly string[];
  readonly active: boolean;
}

function valuesOf(activity: Activity | null): ActivityValues {
  return {
    name: activity?.name ?? '',
    purpose: activity?.purpose ?? '',
    dataCategories: activity?.data_categories ?? [],
    holderTypes: activity?.holder_types ?? [],
    legalBasis: activity?.legal_basis ?? '',
    retention: activity?.retention ?? '',
    transfers: activity?.international_transfers ?? '',
    processorIds: activity?.processors.map((processor) => processor.id) ?? [],
    active: activity === null || activity.status === 'active',
  };
}

function bodyOf(values: ActivityValues) {
  return {
    name: values.name,
    purpose: values.purpose,
    data_categories: [...values.dataCategories],
    holder_types: [...values.holderTypes],
    legal_basis: values.legalBasis,
    retention: values.retention,
    international_transfers: values.transfers.trim() === '' ? null : values.transfers,
    processor_ids: [...values.processorIds],
  };
}

const MESSAGES: Readonly<Record<string, string>> = {
  name: 'Escriba un nombre de 3 a 150 caracteres.',
  purpose: 'Describa la finalidad en al menos 10 caracteres.',
  data_categories: 'Elija al menos una categoría de datos.',
  holder_types: 'Elija al menos un tipo de titular.',
  legal_basis: 'Escriba el fundamento legal en al menos 10 caracteres.',
  retention: 'Escriba cuánto tiempo se conservan los datos.',
  international_transfers: 'Describa las transferencias en al menos 5 caracteres, o deje vacío.',
};

function problemsOf(values: ActivityValues): Record<string, string> {
  const result = createActivityRequestSchema.safeParse(bodyOf(values));
  if (result.success) return {};
  const errors: Record<string, string> = {};
  for (const issue of result.error.issues) {
    const field = String(issue.path[0] ?? '');
    errors[field] ??= MESSAGES[field] ?? 'Revise este dato.';
  }
  return errors;
}

function toggle<T>(list: readonly T[], item: T, checked: boolean): T[] {
  return checked ? [...list, item] : list.filter((value) => value !== item);
}

function Choices<T extends string>(props: {
  readonly id: string;
  readonly legend: string;
  readonly options: readonly { readonly value: T; readonly label: string }[];
  readonly selected: readonly T[];
  readonly error: string | undefined;
  readonly onChange: (selected: T[]) => void;
}): JSX.Element {
  return (
    <fieldset className="flex flex-col gap-2">
      <legend className="mb-1 text-sm font-medium">{props.legend}</legend>
      <div className="grid gap-2 sm:grid-cols-2">
        {props.options.map((option) => (
          <CheckboxField
            key={option.value}
            id={`${props.id}-${option.value}`}
            label={option.label}
            checked={props.selected.includes(option.value)}
            onChange={(checked) => {
              props.onChange(toggle(props.selected, option.value, checked));
            }}
          />
        ))}
      </div>
      {props.error === undefined ? null : (
        <p role="alert" className="text-xs font-medium text-destructive">
          {props.error}
        </p>
      )}
    </fieldset>
  );
}

interface FieldsProps {
  readonly values: ActivityValues;
  readonly errors: Record<string, string>;
  readonly onChange: (values: ActivityValues) => void;
}

function TextFields({ values, errors, onChange }: FieldsProps): JSX.Element {
  const text = (id: string, label: string, field: string, key: keyof ActivityValues) => (
    <TextInput
      id={`actividad-${id}`}
      label={label}
      value={String(values[key])}
      error={errors[field] ?? null}
      onValue={(value) => {
        onChange({ ...values, [key]: value });
      }}
    />
  );
  return (
    <>
      {text('nombre', 'Nombre', 'name', 'name')}
      {text('finalidad', 'Finalidad', 'purpose', 'purpose')}
      {text('fundamento', 'Fundamento legal', 'legal_basis', 'legalBasis')}
      {text('conservacion', 'Tiempo de conservación', 'retention', 'retention')}
      {text(
        'transferencias',
        'Transferencias internacionales (opcional)',
        'international_transfers',
        'transfers',
      )}
    </>
  );
}

function ScopeChoices({ values, errors, onChange }: FieldsProps): JSX.Element {
  return (
    <>
      <Choices
        id="actividad-categoria"
        legend="Datos que trata"
        options={dataCategorySchema.options.map((value) => ({
          value,
          label: DATA_CATEGORY_LABELS[value],
        }))}
        selected={values.dataCategories}
        error={errors['data_categories']}
        onChange={(dataCategories) => {
          onChange({ ...values, dataCategories });
        }}
      />
      <Choices
        id="actividad-titular"
        legend="De quiénes"
        options={holderTypeSchema.options.map((value) => ({
          value,
          label: HOLDER_TYPE_LABELS[value],
        }))}
        selected={values.holderTypes}
        error={errors['holder_types']}
        onChange={(holderTypes) => {
          onChange({ ...values, holderTypes });
        }}
      />
    </>
  );
}

function ProcessorsAndStatus(props: FieldsProps & { readonly creating: boolean }): JSX.Element {
  const { values, onChange } = props;
  const processors = (useProcessors().data?.data ?? []).filter((item) => item.status === 'active');
  return (
    <>
      <Choices
        id="actividad-encargado"
        legend="Encargados que participan (opcional)"
        options={processors.map((item) => ({
          value: item.id,
          label: item.party.name ?? item.service,
        }))}
        selected={values.processorIds}
        error={undefined}
        onChange={(processorIds) => {
          onChange({ ...values, processorIds });
        }}
      />
      {props.creating ? null : (
        <CheckboxField
          id="actividad-activa"
          label="Activa"
          checked={values.active}
          onChange={(active) => {
            onChange({ ...values, active });
          }}
        />
      )}
    </>
  );
}

function ActivityFields(props: FieldsProps & { readonly creating: boolean }): JSX.Element {
  return (
    <>
      <TextFields {...props} />
      <ScopeChoices {...props} />
      <ProcessorsAndStatus {...props} />
    </>
  );
}

export function ActivityForm(props: {
  readonly activity: Activity | null;
  readonly onDone: () => void;
}): JSX.Element {
  const { activity } = props;
  const [values, setValues] = useState(valuesOf(activity));
  const [errors, setErrors] = useState<Record<string, string>>({});
  const save = useSaveActivity(props.onDone);
  const submit = (event: SubmitEvent<HTMLFormElement>): void => {
    event.preventDefault();
    const found = problemsOf(values);
    setErrors(found);
    if (Object.keys(found).length > 0) return;
    const body = bodyOf(values);
    save.execute(
      activity === null
        ? { id: null, body }
        : {
            id: activity.id,
            version: activity.version,
            body: { ...body, status: values.active ? 'active' : 'inactive' },
          },
    );
  };
  return (
    <form noValidate onSubmit={submit} className="flex flex-col gap-4">
      {save.error === null ? null : <FormError error={save.error} />}
      <ActivityFields
        creating={activity === null}
        values={values}
        errors={errors}
        onChange={setValues}
      />
      <SubmitButton label="Guardar" pendingLabel="Guardando…" pending={save.pending} />
      {save.dialog}
    </form>
  );
}

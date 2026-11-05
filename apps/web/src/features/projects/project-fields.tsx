'use client';

import {
  projectMethodologySchema,
  projectTypeSchema,
  type PersonRef,
  type ProjectMethodology,
  type ProjectType,
} from '@arza/contracts';
import { SelectField, TextareaField } from '@arza/ui';
import type { JSX } from 'react';

import type { SummaryField } from '../../components/form-summary';
import { optionsOf } from '../crm/labels';
import { TextFields, type TextFieldSpec } from '../crm/text-fields';
import type { ProjectValues } from './project-form-values';
import { PROJECT_METHODOLOGIES, PROJECT_TYPES } from './labels';

// Los datos del proyecto (B26), los mismos en el asistente y en la edición: nombre, tipo,
// metodología, alcance, fechas, presupuesto de horas y de pesos, y el líder.

type TextKey = 'name' | 'startsOn' | 'endsOn' | 'budgetHours' | 'budgetAmount';

const TEXTS: readonly TextFieldSpec<TextKey>[] = [
  { key: 'name', field: 'name', id: 'proyecto-nombre', label: 'Nombre del proyecto' },
  { key: 'startsOn', field: 'starts_on', id: 'proyecto-inicio', label: 'Inicio', type: 'date' },
  { key: 'endsOn', field: 'ends_on', id: 'proyecto-fin', label: 'Fin planeado', type: 'date' },
  {
    key: 'budgetHours',
    field: 'budget_hours',
    id: 'proyecto-horas',
    label: 'Presupuesto de horas',
    hint: 'Con un decimal como máximo: 320 o 320,5.',
    decimal: true,
  },
  {
    key: 'budgetAmount',
    field: 'budget_amount',
    id: 'proyecto-valor',
    label: 'Presupuesto en pesos',
    hint: 'Sin puntos de miles: 12000000.50. Con contrato, vacío toma su valor.',
    decimal: true,
  },
];

export const DATA_FIELDS: readonly SummaryField[] = [
  ...TEXTS.slice(0, 1),
  { field: 'type', id: 'proyecto-tipo', label: 'Tipo' },
  { field: 'methodology', id: 'proyecto-metodologia', label: 'Metodología' },
  { field: 'description', id: 'proyecto-alcance', label: 'Alcance' },
  ...TEXTS.slice(1),
  { field: 'manager_id', id: 'proyecto-lider', label: 'Líder del proyecto' },
];

const TYPE_OPTIONS = optionsOf(projectTypeSchema.options, PROJECT_TYPES);
const METHODOLOGY_OPTIONS = optionsOf(projectMethodologySchema.options, PROJECT_METHODOLOGIES);

type Set = (patch: Partial<ProjectValues>) => void;

interface FieldsProps {
  readonly values: ProjectValues;
  readonly problems: Readonly<Record<string, string>>;
  readonly people: readonly PersonRef[];
  readonly set: Set;
}

function Kind(props: FieldsProps): JSX.Element {
  return (
    <>
      <SelectField
        id="proyecto-tipo"
        label="Tipo"
        options={TYPE_OPTIONS}
        value={props.values.type}
        error={props.problems['type']}
        onChange={(event) => {
          props.set({ type: event.target.value as ProjectType });
        }}
      />
      <SelectField
        id="proyecto-metodologia"
        label="Metodología"
        options={METHODOLOGY_OPTIONS}
        value={props.values.methodology}
        error={props.problems['methodology']}
        onChange={(event) => {
          props.set({ methodology: event.target.value as ProjectMethodology });
        }}
      />
    </>
  );
}

function Leader(props: FieldsProps): JSX.Element {
  const options = [
    { value: '', label: 'Elija el líder' },
    ...props.people.map((person) => ({ value: person.id, label: person.name })),
  ];
  return (
    <SelectField
      id="proyecto-lider"
      label="Líder del proyecto"
      hint="Queda en el equipo con el rol «Líder del proyecto»."
      options={options}
      value={props.values.managerId}
      error={props.problems['manager_id']}
      onChange={(event) => {
        props.set({ managerId: event.target.value });
      }}
    />
  );
}

export function ProjectDataFields(props: FieldsProps): JSX.Element {
  const texts = (specs: readonly TextFieldSpec<TextKey>[]) => (
    <TextFields
      specs={specs}
      values={props.values}
      problems={props.problems}
      onChange={(key, text) => {
        props.set({ [key]: text });
      }}
    />
  );
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      {texts(TEXTS.slice(0, 1))}
      <Kind {...props} />
      <div className="sm:col-span-2">
        <TextareaField
          id="proyecto-alcance"
          label="Alcance en pocas palabras (opcional)"
          value={props.values.description}
          error={props.problems['description'] ?? null}
          onChange={(event) => {
            props.set({ description: event.target.value });
          }}
        />
      </div>
      {texts(TEXTS.slice(1))}
      <Leader {...props} />
    </div>
  );
}

'use client';

import {
  itemPrioritySchema,
  itemTypeSchema,
  parentAllowedTypes,
  type ItemPriority,
  type ItemType,
  type ProjectDetail,
  type ProjectItem,
} from '@arza/contracts';
import { useState, type JSX } from 'react';

import type { AdminAction } from '../administration/admin-action';
import { optionsOf } from '../crm/labels';
import { Choice, DialogForm, Fields, decimal, summaryOf, type FieldSpec } from './form-bits';
import { ITEM_PRIORITIES, ITEM_TYPES, itemLabel } from './labels';

// Formulario de un ítem de la lista de pendientes (B26): tipo (solo al crear), de qué épica o
// historia cuelga, título, criterios de aceptación, descripción, prioridad, estimación y quién lo
// tiene a cargo. Sin criterios de aceptación el ítem no entra a una iteración.

interface ItemValues {
  readonly type: ItemType;
  readonly parentId: string;
  readonly title: string;
  readonly description: string;
  readonly criteria: string;
  readonly priority: ItemPriority;
  readonly estimate: string;
  readonly assigneeId: string;
}

type TextKey = 'title' | 'criteria' | 'description' | 'estimate';

const TEXTS: readonly FieldSpec<TextKey>[] = [
  { key: 'title', field: 'title', id: 'item-titulo', label: 'Título' },
  {
    key: 'criteria',
    field: 'acceptance_criteria',
    id: 'item-criterios',
    label: 'Criterios de aceptación',
    hint: 'Sin criterios, el ítem no puede entrar a una iteración.',
    multiline: true,
  },
  {
    key: 'description',
    field: 'description',
    id: 'item-descripcion',
    label: 'Descripción (opcional)',
    multiline: true,
  },
  {
    key: 'estimate',
    field: 'estimate_hours',
    id: 'item-estimacion',
    label: 'Estimación en horas (opcional)',
    inputMode: 'decimal',
  },
];

const TYPE_OPTIONS = optionsOf(itemTypeSchema.options, ITEM_TYPES);
const PRIORITY_OPTIONS = optionsOf(itemPrioritySchema.options, ITEM_PRIORITIES);

function valuesOf(item: ProjectItem | null): ItemValues {
  const estimate = item?.estimate_hours ?? null;
  return {
    type: item?.type ?? 'story',
    parentId: item?.parent?.id ?? '',
    title: item?.title ?? '',
    description: item?.description ?? '',
    criteria: item?.acceptance_criteria ?? '',
    priority: item?.priority ?? 'normal',
    estimate: estimate === null ? '' : String(estimate),
    assigneeId: item?.assignee?.id ?? '',
  };
}

function orNull(text: string): string | null {
  const trimmed = text.trim();
  return trimmed === '' ? null : trimmed;
}

function bodyOf(values: ItemValues, creating: boolean): Record<string, unknown> {
  return {
    ...(creating ? { type: values.type } : {}),
    parent_id: orNull(values.parentId),
    title: values.title.trim(),
    description: orNull(values.description),
    acceptance_criteria: orNull(values.criteria),
    priority: values.priority,
    estimate_hours: values.estimate.trim() === '' ? null : decimal(values.estimate),
    assignee_id: orNull(values.assigneeId),
  };
}

function problemsOf(values: ItemValues): Record<string, string> {
  const found: Record<string, string> = {};
  if (values.title.trim().length < 3) found['title'] = 'Escriba un título corto.';
  const estimate = decimal(values.estimate);
  const badEstimate = Number.isNaN(estimate) || estimate < 0.5 || estimate > 999;
  if (values.estimate.trim() !== '' && badEstimate) {
    found['estimate_hours'] = 'Escriba las horas estimadas, de 0,5 a 999.';
  }
  return found;
}

interface ChoicesProps {
  readonly values: ItemValues;
  readonly set: (patch: Partial<ItemValues>) => void;
  readonly parents: readonly ProjectItem[];
  readonly project: ProjectDetail;
}

function parentOptions(props: ChoicesProps): { value: string; label: string }[] {
  const allowed = parentAllowedTypes(props.values.type);
  const none = allowed.length === 0 ? 'Las épicas no cuelgan de otro ítem' : 'De ninguno';
  return [
    { value: '', label: none },
    ...props.parents
      .filter((parent) => allowed.includes(parent.type))
      .map((parent) => ({
        value: parent.id,
        label: `${ITEM_TYPES[parent.type]} ${itemLabel(parent)}`,
      })),
  ];
}

function Choices(props: ChoicesProps): JSX.Element {
  const people = [
    { value: '', label: 'Sin asignar' },
    ...props.project.members.map((m) => ({ value: m.person.id, label: m.person.name })),
  ];
  return (
    <>
      <Choice
        id="item-padre"
        label="Pertenece a"
        options={parentOptions(props)}
        value={props.values.parentId}
        onValue={(parentId) => {
          props.set({ parentId });
        }}
      />
      <Choice
        id="item-responsable"
        label="A cargo de"
        options={people}
        value={props.values.assigneeId}
        onValue={(assigneeId) => {
          props.set({ assigneeId });
        }}
      />
      <Choice
        id="item-prioridad"
        label="Prioridad"
        options={PRIORITY_OPTIONS}
        value={props.values.priority}
        onValue={(priority) => {
          props.set({ priority: priority as ItemPriority });
        }}
      />
    </>
  );
}

function useItemForm(item: ProjectItem | null, action: AdminAction<object, unknown>) {
  const [values, setValues] = useState(() => valuesOf(item));
  const [problems, setProblems] = useState<Record<string, string>>({});
  const set = (patch: Partial<ItemValues>): void => {
    setValues({ ...values, ...patch });
  };
  const submit = (): void => {
    const found = problemsOf(values);
    setProblems(found);
    if (Object.keys(found).length === 0) action.execute(bodyOf(values, item === null));
  };
  return { values, problems, set, submit };
}

function TypeChoice(props: {
  readonly values: ItemValues;
  readonly set: (patch: Partial<ItemValues>) => void;
}) {
  return (
    <Choice
      id="item-tipo"
      label="Tipo"
      options={TYPE_OPTIONS}
      value={props.values.type}
      onValue={(type) => {
        props.set({ type: type as ItemType, parentId: '' });
      }}
    />
  );
}

export function ItemForm(props: {
  readonly project: ProjectDetail;
  readonly item: ProjectItem | null;
  readonly parents: readonly ProjectItem[];
  readonly action: AdminAction<object, unknown>;
}): JSX.Element {
  const creating = props.item === null;
  const { values, problems, set, submit } = useItemForm(props.item, props.action);
  return (
    <DialogForm
      problems={problems}
      fields={summaryOf(TEXTS)}
      action={props.action}
      submitLabel={creating ? 'Crear el ítem' : 'Guardar'}
      onSubmit={submit}
    >
      {creating ? <TypeChoice values={values} set={set} /> : null}
      <Fields
        specs={TEXTS}
        values={values}
        problems={problems}
        onChange={(key, text) => {
          set({ [key]: text });
        }}
      />
      <Choices values={values} set={set} parents={props.parents} project={props.project} />
    </DialogForm>
  );
}

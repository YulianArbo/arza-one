'use client';

import {
  conditionRuleSchema,
  isPermissionCode,
  PERMISSIONS,
  type StateInput,
  type TransitionInput,
} from '@arza/contracts';
import { Button, Card, CardContent, Checkbox, FormField, Label, SelectField } from '@arza/ui';
import type { JSX } from 'react';

import {
  conditionFieldsOf,
  conditionOf,
  emptyTransition,
  removeAt,
  replaceAt,
  type ConditionFields,
} from './editor-model';
import { CONDITION_OPERATORS } from './labels';

// Transiciones del editor de flujos: de qué estado a cuál, con qué acción, qué permiso exige, qué
// condición debe cumplir el registro y si pide comentario. «approve» y «reject» de un estado de
// aprobación las ejecuta el motor con las decisiones.

const PERMISSION_OPTIONS = [
  { value: '', label: 'Quien atiende el paso' },
  ...PERMISSIONS.map((permission) => ({
    value: permission.code,
    label: `${permission.description} (${permission.code})`,
  })),
];

interface RowProps {
  readonly transition: TransitionInput;
  readonly index: number;
  readonly states: readonly StateInput[];
  readonly onChange: (transition: TransitionInput) => void;
}

function ConditionEditor({ transition, index, onChange }: Omit<RowProps, 'states'>): JSX.Element {
  const fields = conditionFieldsOf(transition.condition);
  const id = `transicion-${String(index)}-condicion`;
  const set = (patch: Partial<ConditionFields>): void => {
    onChange({ ...transition, condition: conditionOf({ ...fields, ...patch }) });
  };
  return (
    <fieldset className="grid gap-3 rounded-md border p-3 md:grid-cols-3">
      <legend className="px-1 text-sm font-medium">Condición (opcional)</legend>
      <FormField
        id={`${id}-dato`}
        label="Dato del registro"
        hint="Por ejemplo: amount"
        value={fields.fact}
        onChange={(event) => {
          set({ fact: event.target.value });
        }}
      />
      <SelectField
        id={`${id}-comparacion`}
        label="Comparación"
        options={CONDITION_OPERATORS}
        value={fields.op}
        onChange={(event) => {
          set({ op: conditionRuleSchema.shape.op.parse(event.target.value) });
        }}
      />
      <FormField
        id={`${id}-valor`}
        label="Valor"
        value={fields.value}
        onChange={(event) => {
          set({ value: event.target.value });
        }}
      />
    </fieldset>
  );
}

function NamingFields({ transition, index, onChange }: Omit<RowProps, 'states'>): JSX.Element {
  const id = `transicion-${String(index)}`;
  return (
    <>
      <FormField
        id={`${id}-accion`}
        label="Clave de la acción"
        value={transition.action}
        onChange={(event) => {
          onChange({ ...transition, action: event.target.value });
        }}
      />
      <FormField
        id={`${id}-nombre`}
        label="Nombre del botón"
        value={transition.label}
        onChange={(event) => {
          onChange({ ...transition, label: event.target.value });
        }}
      />
    </>
  );
}

function RouteFields({ transition, index, states, onChange }: RowProps): JSX.Element {
  const id = `transicion-${String(index)}`;
  const options = states.map((state) => ({ value: state.key, label: state.label }));
  return (
    <div className="grid gap-3 md:grid-cols-4">
      <SelectField
        id={`${id}-desde`}
        label="Desde"
        options={options}
        value={transition.from_state}
        onChange={(event) => {
          onChange({ ...transition, from_state: event.target.value });
        }}
      />
      <SelectField
        id={`${id}-hasta`}
        label="Hasta"
        options={options}
        value={transition.to_state}
        onChange={(event) => {
          onChange({ ...transition, to_state: event.target.value });
        }}
      />
      <NamingFields transition={transition} index={index} onChange={onChange} />
    </div>
  );
}

function RuleFields({ transition, index, onChange }: Omit<RowProps, 'states'>): JSX.Element {
  const id = `transicion-${String(index)}`;
  return (
    <div className="grid items-end gap-3 md:grid-cols-2">
      <SelectField
        id={`${id}-permiso`}
        label="Quién puede hacerla"
        options={PERMISSION_OPTIONS}
        value={transition.required_permission ?? ''}
        onChange={(event) => {
          const code = event.target.value;
          onChange({ ...transition, required_permission: isPermissionCode(code) ? code : null });
        }}
      />
      <div className="flex items-center gap-2 pb-2">
        <Checkbox
          id={`${id}-comentario`}
          checked={transition.requires_comment}
          onChange={(event) => {
            onChange({ ...transition, requires_comment: event.target.checked });
          }}
        />
        <Label htmlFor={`${id}-comentario`}>Exige comentario</Label>
      </div>
    </div>
  );
}

function TransitionRow(props: RowProps & { readonly onRemove: () => void }): JSX.Element {
  return (
    <Card>
      <CardContent className="flex flex-col gap-3 pt-4">
        <RouteFields {...props} />
        <RuleFields {...props} />
        <ConditionEditor {...props} />
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="self-start"
          onClick={props.onRemove}
        >
          Quitar la transición «{props.transition.label}»
        </Button>
      </CardContent>
    </Card>
  );
}

function TransitionsIntro(): JSX.Element {
  return (
    <>
      <h2 id="transiciones-titulo" className="text-lg font-semibold">
        Transiciones
      </h2>
      <p className="text-sm text-muted-foreground">
        Solo estos caminos existen: cualquier otro paso es imposible, también por la API. En un
        estado de aprobación, las acciones «approve» y «reject» las ejecuta el motor con las
        decisiones.
      </p>
    </>
  );
}

export function TransitionEditor(props: {
  readonly transitions: readonly TransitionInput[];
  readonly states: readonly StateInput[];
  readonly onChange: (transitions: TransitionInput[]) => void;
}): JSX.Element {
  return (
    <section aria-labelledby="transiciones-titulo" className="flex flex-col gap-3">
      <TransitionsIntro />
      {props.transitions.map((transition, index) => (
        <TransitionRow
          key={`transicion-${String(index)}`}
          transition={transition}
          index={index}
          states={props.states}
          onChange={(next) => {
            props.onChange(replaceAt(props.transitions, index, next));
          }}
          onRemove={() => {
            props.onChange(removeAt(props.transitions, index));
          }}
        />
      ))}
      <Button
        type="button"
        variant="outline"
        className="self-start"
        onClick={() => {
          props.onChange([...props.transitions, emptyTransition(props.states)]);
        }}
      >
        Agregar una transición
      </Button>
    </section>
  );
}

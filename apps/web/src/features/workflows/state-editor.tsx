'use client';

import { stateKindSchema, taskPrioritySchema, type StateInput } from '@arza/contracts';
import { Button, Card, CardContent } from '@arza/ui';
import type { JSX } from 'react';

import { FormField } from '../access/form-field';
import { SelectField } from '../administration/select-field';
import { choiceOf, emptyState, participantOf, removeAt, replaceAt, withKind } from './editor-model';
import { PRIORITY_LABELS, STATE_KIND_LABELS } from './labels';

// Estados del editor de flujos: clave, nombre, tipo, plazo en horas hábiles, prioridad, quién lo
// atiende y, en los de aprobación, quién aprueba, en serie o en paralelo.

export interface Option {
  readonly value: string;
  readonly label: string;
}

const KIND_OPTIONS = Object.entries(STATE_KIND_LABELS).map(([value, label]) => ({ value, label }));
const PRIORITY_OPTIONS = Object.entries(PRIORITY_LABELS).map(([value, label]) => ({
  value,
  label,
}));
const MODE_OPTIONS = [
  { value: 'serial', label: 'En serie: uno después de otro' },
  { value: 'parallel', label: 'En paralelo: todos a la vez' },
];
const APPROVER_SLOTS = 3;

/** Quién atiende o aprueba: quien inició, su jefe inmediato o un rol. */
function participantOptions(roles: readonly Option[], empty: string): Option[] {
  return [
    { value: '', label: empty },
    { value: 'initiator', label: 'Quien inició el trámite' },
    { value: 'supervisor', label: 'Su jefe inmediato' },
    ...roles.map((role) => ({ value: `role:${role.value}`, label: `Rol: ${role.label}` })),
  ];
}

interface RowProps {
  readonly state: StateInput;
  readonly index: number;
  readonly roles: readonly Option[];
  readonly onChange: (state: StateInput) => void;
}

type FieldProps = Omit<RowProps, 'roles'>;

function ModeField({ state, index, onChange }: FieldProps): JSX.Element | null {
  const approval = state.approval;
  if (approval === null) return null;
  return (
    <SelectField
      id={`estado-${String(index)}-modo`}
      label="Cómo se aprueba"
      options={MODE_OPTIONS}
      value={approval.mode}
      onChange={(event) => {
        const mode = event.target.value === 'parallel' ? 'parallel' : 'serial';
        onChange({ ...state, approval: { ...approval, mode } });
      }}
    />
  );
}

function ApprovalFields({ state, index, roles, onChange }: RowProps): JSX.Element | null {
  const approval = state.approval;
  if (approval === null) return null;
  const options = participantOptions(roles, 'Nadie');
  const slots = Array.from(
    { length: APPROVER_SLOTS },
    (_, slot) => approval.approvers[slot] ?? null,
  );
  const setSlot = (slot: number, choice: string): void => {
    const approvers = replaceAt(slots, slot, participantOf(choice)).filter((item) => item !== null);
    onChange({ ...state, approval: { ...approval, approvers } });
  };
  return (
    <div className="grid gap-3 md:grid-cols-4">
      <ModeField state={state} index={index} onChange={onChange} />
      {slots.map((participant, slot) => (
        <SelectField
          key={`aprobador-${String(slot)}`}
          id={`estado-${String(index)}-aprobador-${String(slot)}`}
          label={`Aprobador ${String(slot + 1)}`}
          options={options}
          value={choiceOf(participant)}
          onChange={(event) => {
            setSlot(slot, event.target.value);
          }}
        />
      ))}
    </div>
  );
}

function NameFields({ state, index, onChange }: FieldProps): JSX.Element {
  const id = `estado-${String(index)}`;
  return (
    <>
      <FormField
        id={`${id}-clave`}
        label="Clave"
        value={state.key}
        onChange={(event) => {
          onChange({ ...state, key: event.target.value });
        }}
      />
      <FormField
        id={`${id}-nombre`}
        label="Nombre"
        value={state.label}
        onChange={(event) => {
          onChange({ ...state, label: event.target.value });
        }}
      />
    </>
  );
}

function DeadlineField({ state, index, onChange }: FieldProps): JSX.Element {
  return (
    <FormField
      id={`estado-${String(index)}-plazo`}
      label="Plazo (horas hábiles)"
      type="number"
      min={1}
      disabled={state.kind === 'final'}
      value={state.sla_hours ?? ''}
      onChange={(event) => {
        const hours = Number.parseInt(event.target.value, 10);
        onChange({ ...state, sla_hours: Number.isNaN(hours) ? null : hours });
      }}
    />
  );
}

function BasicFields(props: FieldProps): JSX.Element {
  const { state, index, onChange } = props;
  const id = `estado-${String(index)}`;
  return (
    <div className="grid gap-3 md:grid-cols-5">
      <NameFields {...props} />
      <SelectField
        id={`${id}-tipo`}
        label="Tipo"
        options={KIND_OPTIONS}
        value={state.kind}
        onChange={(event) => {
          onChange(withKind(state, stateKindSchema.parse(event.target.value)));
        }}
      />
      <DeadlineField {...props} />
      <SelectField
        id={`${id}-prioridad`}
        label="Prioridad"
        options={PRIORITY_OPTIONS}
        value={state.priority}
        onChange={(event) => {
          onChange({ ...state, priority: taskPrioritySchema.parse(event.target.value) });
        }}
      />
    </div>
  );
}

function StateRow(props: RowProps & { readonly onRemove: () => void }): JSX.Element {
  const { state, index, roles, onChange } = props;
  const attended = state.kind === 'initial' || state.kind === 'normal';
  return (
    <Card>
      <CardContent className="flex flex-col gap-3 pt-4">
        <BasicFields state={state} index={index} onChange={onChange} />
        {attended ? (
          <SelectField
            id={`estado-${String(index)}-responsable`}
            label="Quién lo atiende"
            options={participantOptions(roles, 'Nadie (sin tarea)')}
            value={choiceOf(state.assignee)}
            onChange={(event) => {
              onChange({ ...state, assignee: participantOf(event.target.value) });
            }}
          />
        ) : null}
        <ApprovalFields {...props} />
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="self-start"
          onClick={props.onRemove}
        >
          Quitar el estado «{state.label}»
        </Button>
      </CardContent>
    </Card>
  );
}

export function StateEditor(props: {
  readonly states: readonly StateInput[];
  readonly roles: readonly Option[];
  readonly onChange: (states: StateInput[]) => void;
}): JSX.Element {
  return (
    <section aria-labelledby="estados-titulo" className="flex flex-col gap-3">
      <h2 id="estados-titulo" className="text-lg font-semibold">
        Estados
      </h2>
      {props.states.map((state, index) => (
        <StateRow
          key={`estado-${String(index)}`}
          state={state}
          index={index}
          roles={props.roles}
          onChange={(next) => {
            props.onChange(replaceAt(props.states, index, next));
          }}
          onRemove={() => {
            props.onChange(removeAt(props.states, index));
          }}
        />
      ))}
      <Button
        type="button"
        variant="outline"
        className="self-start"
        onClick={() => {
          props.onChange([...props.states, emptyState(props.states.length)]);
        }}
      >
        Agregar un estado
      </Button>
    </section>
  );
}

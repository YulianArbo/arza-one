'use client';

import type { TicketDetail } from '@arza/contracts';
import type { JSX } from 'react';

import { useApiClient } from '../../lib/api/api-provider';
import type { AdminAction } from '../administration/admin-action';
import { Choice, DialogForm, Fields, useDialogForm, type FieldSpec } from '../projects/form-bits';
import { useServiceAction, useTicketOptions } from './queries';

// Formularios de los pasos del tiquete que piden un dato (B28): a quién se asigna o escala y por
// qué, la nota al cliente al ponerlo en espera, la solución y el motivo para reabrir.

interface StepProps {
  readonly ticket: TicketDetail;
  readonly onDone: () => void;
}

/** Un paso del recorrido con la versión que se vio del tiquete. */
export function useStep(
  ticket: TicketDetail,
  action: string,
  onDone?: () => void,
): AdminAction<object, void> {
  const api = useApiClient();
  return useServiceAction<object>(async (body, csrfToken) => {
    await api.post(`/v1/tickets/${ticket.id}/actions/${action}`, {
      body,
      version: ticket.version,
      csrfToken,
    });
  }, onDone);
}

const REASON: readonly FieldSpec<'reason'>[] = [
  {
    key: 'reason',
    field: 'reason',
    id: 'tiquete-motivo',
    label: 'Por qué se escala',
    multiline: true,
  },
];

const ASSIGNEE = { field: 'assignee_id', id: 'tiquete-responsable', label: 'Responsable' };

interface AssignValues {
  readonly assignee: string;
  readonly reason: string;
}

function assignProblems(escalate: boolean) {
  return (values: AssignValues): Record<string, string> => {
    const found: Record<string, string> = {};
    if (values.assignee === '') found['assignee_id'] = 'Elija a quién.';
    if (escalate && values.reason.trim().length < 3) found['reason'] = 'Escriba el motivo.';
    return found;
  };
}

function assignBody(escalate: boolean, values: AssignValues): object {
  return escalate
    ? { assignee_id: values.assignee, reason: values.reason.trim() }
    : { assignee_id: values.assignee };
}

/** Asignar o escalar: a quién y, al escalar, por qué. */
function useAssigneeOptions(): { value: string; label: string }[] {
  const people = useTicketOptions(true).data?.assignees ?? [];
  return [
    { value: '', label: 'Elija a quién' },
    ...people.map((p) => ({ value: p.id, label: p.name })),
  ];
}

export function AssignForm(props: StepProps & { readonly escalate: boolean }): JSX.Element {
  const options = useAssigneeOptions();
  const step = useStep(props.ticket, props.escalate ? 'escalate' : 'assign', props.onDone);
  const send = (values: AssignValues): void => {
    step.execute(assignBody(props.escalate, values));
  };
  const form = useDialogForm({ assignee: '', reason: '' }, assignProblems(props.escalate), send);
  const specs = props.escalate ? REASON : [];
  return (
    <DialogForm
      problems={form.problems}
      fields={[ASSIGNEE, ...specs]}
      action={step}
      submitLabel={props.escalate ? 'Escalar' : 'Asignar'}
      onSubmit={form.submit}
    >
      <Choice
        id={ASSIGNEE.id}
        label={ASSIGNEE.label}
        options={options}
        value={form.values.assignee}
        error={form.problems['assignee_id']}
        onValue={(assignee) => {
          form.set({ assignee });
        }}
      />
      <Fields
        specs={specs}
        values={form.values}
        problems={form.problems}
        onChange={(_key, reason) => {
          form.set({ reason });
        }}
      />
    </DialogForm>
  );
}

export interface TextStep {
  readonly action: string;
  readonly field: string;
  readonly label: string;
  readonly submitLabel: string;
  readonly optional?: boolean;
}

function textProblems(step: TextStep) {
  return (values: { text: string }): Record<string, string> =>
    step.optional === true || values.text.trim().length >= 3
      ? {}
      : { [step.field]: 'Escriba al menos tres letras.' };
}

/** Un paso que pide un texto: la nota al cliente, la solución o el motivo. */
export function TextStepForm(props: StepProps & { readonly step: TextStep }): JSX.Element {
  const { step: spec } = props;
  const step = useStep(props.ticket, spec.action, props.onDone);
  const fields: readonly FieldSpec<'text'>[] = [
    {
      key: 'text',
      field: spec.field,
      id: `tiquete-${spec.action}`,
      label: spec.label,
      multiline: true,
    },
  ];
  const form = useDialogForm({ text: '' }, textProblems(spec), (values) => {
    const text = values.text.trim();
    step.execute({ [spec.field]: text.length >= 3 ? text : null });
  });
  return (
    <DialogForm
      problems={form.problems}
      fields={fields}
      action={step}
      submitLabel={spec.submitLabel}
      onSubmit={form.submit}
    >
      <Fields
        specs={fields}
        values={form.values}
        problems={form.problems}
        onChange={(_key, text) => {
          form.set({ text });
        }}
      />
    </DialogForm>
  );
}

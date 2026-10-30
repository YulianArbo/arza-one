'use client';

import { createAmendmentRequestSchema, type ContractDetail } from '@arza/contracts';
import { DialogFooter, FormField, TextareaField } from '@arza/ui';
import { useState, type JSX, type SubmitEvent } from 'react';

import { useApiClient } from '../../lib/api/api-provider';
import { FormError } from '../access/form-alert';
import { SubmitButton } from '../access/submit-button';
import { useContractAction } from './queries';

// Proponer un otrosí (B24, ficha 17.7): qué cambia, su texto, desde cuándo rige y, si cambian, la
// nueva fecha de fin y el nuevo valor. La Dirección lo revisa; rige al registrar la firmada.

interface Props {
  readonly contract: ContractDetail;
}

const TEXT = {
  summary: 'Qué cambia, en una línea',
  body: 'Texto del otrosí',
  effective: 'Desde cuándo rige',
  ends: 'Nueva fecha de fin (opcional)',
  value: 'Nuevo valor total en pesos (opcional)',
};

interface ProposeValues {
  readonly summary: string;
  readonly body: string;
  readonly effective: string;
  readonly ends: string;
  readonly value: string;
}

/** El cuerpo del otrosí que espera la API; vacíos los cambios que no se piden. */
export function amendmentBody(values: ProposeValues): Record<string, string | null> {
  return {
    summary: values.summary.trim(),
    body: values.body.trim(),
    effective_on: values.effective,
    new_ends_on: values.ends === '' ? null : values.ends,
    new_value: values.value.trim() === '' ? null : values.value.trim(),
  };
}

function useProposeForm(props: Props & { readonly onDone: () => void }) {
  const api = useApiClient();
  const empty = { summary: '', body: '', effective: '', ends: '', value: '' };
  const [values, setValues] = useState<ProposeValues>(empty);
  const [problem, setProblem] = useState<string | null>(null);
  const propose = useContractAction<object>(async (body, csrfToken) => {
    await api.post(`/v1/contracts/${props.contract.id}/amendments`, { body, csrfToken });
  }, props.onDone);
  const submit = (event: SubmitEvent<HTMLFormElement>): void => {
    event.preventDefault();
    const body = amendmentBody(values);
    const valid = createAmendmentRequestSchema.safeParse(body).success;
    setProblem(
      valid ? null : 'Escriba qué cambia, el texto (10 letras o más) y la fecha en que rige.',
    );
    if (valid) propose.execute(body);
  };
  return { values, setValues, problem, propose, submit };
}

function ProposeFields(props: {
  readonly values: ProposeValues;
  readonly onChange: (values: ProposeValues) => void;
}): JSX.Element {
  const { values } = props;
  const field = (key: keyof ProposeValues, type: 'text' | 'date' = 'text') => (
    <FormField
      id={`otrosi-${key}`}
      label={TEXT[key]}
      type={type}
      value={values[key]}
      onChange={(event) => {
        props.onChange({ ...values, [key]: event.target.value });
      }}
    />
  );
  return (
    <>
      {field('summary')}
      <TextareaField
        id="otrosi-body"
        label={TEXT.body}
        rows={4}
        value={values.body}
        onChange={(event) => {
          props.onChange({ ...values, body: event.target.value });
        }}
      />
      {field('effective', 'date')}
      {field('ends', 'date')}
      {field('value')}
    </>
  );
}

export function ProposeForm(props: Props & { readonly onDone: () => void }): JSX.Element {
  const form = useProposeForm(props);
  return (
    <form noValidate onSubmit={form.submit} className="flex flex-col gap-4">
      {form.propose.error === null ? null : <FormError error={form.propose.error} />}
      {form.problem === null ? null : (
        <p role="alert" className="text-sm text-destructive">
          {form.problem}
        </p>
      )}
      <ProposeFields values={form.values} onChange={form.setValues} />
      <DialogFooter>
        <SubmitButton
          label="Enviar a la Dirección"
          pendingLabel="Enviando…"
          pending={form.propose.pending}
        />
      </DialogFooter>
      {form.propose.dialog}
    </form>
  );
}

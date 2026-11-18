'use client';

import { FormField, SelectField } from '@arza/ui';
import { useState, type JSX, type ReactNode } from 'react';
import type { z } from 'zod';

import { FormSummary } from '../../components/form-summary';
import { FormError } from '../access/form-alert';
import { SubmitButton } from '../access/submit-button';
import { problemsOf } from '../finance/ledger-ui';
import { useHrAction } from './hr-queries';

export interface HrField {
  readonly key: string;
  readonly label: string;
  readonly type?: 'text' | 'date' | 'email' | 'number';
  readonly options?: readonly { readonly value: string; readonly label: string }[];
  readonly value?: string;
}

/** Valor de texto del formulario; los archivos no se convierten a cadena. */
function fieldValue(form: FormData, key: string): string {
  const entry = form.get(key);
  return typeof entry === 'string' ? entry : '';
}

function formValues(form: FormData, fields: readonly HrField[]): Record<string, string> {
  return Object.fromEntries(fields.map((field) => [field.key, fieldValue(form, field.key)]));
}

/** Campo de texto o lista según tenga opciones. */
function HrFieldControl(props: {
  readonly field: HrField;
  readonly error: string | null;
}): JSX.Element {
  const common = {
    id: `hr-${props.field.key}`,
    name: props.field.key,
    label: props.field.label,
    defaultValue: props.field.value ?? '',
  };
  if (props.field.options === undefined) {
    return <FormField {...common} type={props.field.type ?? 'text'} error={props.error} />;
  }
  return (
    <SelectField
      {...common}
      error={props.error ?? undefined}
      options={[{ value: '', label: 'Seleccione…' }, ...props.field.options]}
    />
  );
}

export function HrForm<T>(props: {
  readonly fields: readonly HrField[];
  readonly children?: ReactNode;
  readonly schema: z.ZodType<T>;
  readonly prepare?: (values: Record<string, string>) => unknown;
  readonly run: (input: T, csrfToken: string) => Promise<unknown>;
  readonly label: string;
  readonly onDone: () => void;
}): JSX.Element {
  const [problems, setProblems] = useState<Record<string, string>>({});
  const action = useHrAction(props.run, props.onDone);
  return (
    <form
      noValidate
      className="flex flex-col gap-4"
      onSubmit={(event) => {
        event.preventDefault();
        const values = formValues(new FormData(event.currentTarget), props.fields);
        const input = props.schema.safeParse(props.prepare?.(values) ?? values);
        setProblems(input.success ? {} : problemsOf(input.error));
        if (input.success) action.execute(input.data);
      }}
    >
      <FormSummary
        problems={problems}
        fields={props.fields.map(({ key, label }) => ({ field: key, id: `hr-${key}`, label }))}
      />
      {props.fields.map((field) => (
        <HrFieldControl key={field.key} field={field} error={problems[field.key] ?? null} />
      ))}
      {props.children}
      {action.error === null ? null : <FormError error={action.error} />}
      <SubmitButton pending={action.pending} pendingLabel="Guardando…" label={props.label} />
      {action.dialog}
    </form>
  );
}

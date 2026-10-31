'use client';

import { DialogFooter, FormField, SelectField, TextareaField } from '@arza/ui';
import type { JSX, ReactNode, SubmitEvent } from 'react';

import { FormSummary, type SummaryField } from '../../components/form-summary';
import { FormError } from '../access/form-alert';
import { SubmitButton } from '../access/submit-button';
import type { AdminAction } from '../administration/admin-action';

// Piezas de los formularios de Proyectos (B26), dentro de un diálogo: el resumen de errores al
// enviar, el error de la API, los campos con su mensaje y el botón de guardar (numeral 16.4).

type Problems = Readonly<Record<string, string>>;

export function DialogForm(props: {
  readonly problems: Problems;
  readonly fields: readonly SummaryField[];
  readonly action: AdminAction<never, unknown>;
  readonly submitLabel: string;
  readonly onSubmit: () => void;
  readonly children: ReactNode;
}): JSX.Element {
  const submit = (event: SubmitEvent<HTMLFormElement>): void => {
    event.preventDefault();
    props.onSubmit();
  };
  return (
    <form noValidate onSubmit={submit} className="flex flex-col gap-3">
      <FormSummary problems={props.problems} fields={props.fields} />
      {props.action.error === null ? null : <FormError error={props.action.error} />}
      {props.children}
      <DialogFooter>
        <SubmitButton
          label={props.submitLabel}
          pendingLabel="Guardando…"
          pending={props.action.pending}
        />
      </DialogFooter>
      {props.action.dialog}
    </form>
  );
}

interface InputProps {
  readonly id: string;
  readonly label: string;
  readonly value: string;
  readonly onValue: (value: string) => void;
  readonly error?: string | undefined;
  readonly hint?: string;
}

export function TextInput(
  props: InputProps & {
    readonly type?: 'text' | 'date' | 'url';
    readonly inputMode?: 'decimal' | 'numeric';
  },
): JSX.Element {
  return (
    <FormField
      id={props.id}
      label={props.label}
      type={props.type ?? 'text'}
      value={props.value}
      error={props.error ?? null}
      {...(props.hint === undefined ? {} : { hint: props.hint })}
      {...(props.inputMode === undefined ? {} : { inputMode: props.inputMode })}
      onChange={(event) => {
        props.onValue(event.target.value);
      }}
    />
  );
}

function LongText(props: InputProps): JSX.Element {
  return (
    <TextareaField
      id={props.id}
      label={props.label}
      value={props.value}
      error={props.error ?? null}
      {...(props.hint === undefined ? {} : { hint: props.hint })}
      onChange={(event) => {
        props.onValue(event.target.value);
      }}
    />
  );
}

export function Choice(
  props: InputProps & { readonly options: readonly { value: string; label: string }[] },
): JSX.Element {
  return (
    <SelectField
      id={props.id}
      label={props.label}
      options={props.options}
      value={props.value}
      error={props.error}
      hint={props.hint}
      onChange={(event) => {
        props.onValue(event.target.value);
      }}
    />
  );
}

/** Un campo descrito como datos: su clave en los valores, el campo de la API y cómo se escribe. */
export interface FieldSpec<K extends string> {
  readonly key: K;
  readonly field: string;
  readonly id: string;
  readonly label: string;
  readonly type?: 'text' | 'date' | 'url';
  readonly inputMode?: 'decimal' | 'numeric';
  readonly hint?: string;
  readonly multiline?: boolean;
}

/** Los campos de texto de un formulario, en orden, con el problema de cada uno. */
export function Fields<K extends string>(props: {
  readonly specs: readonly FieldSpec<K>[];
  readonly values: Readonly<Record<K, string>>;
  readonly problems: Problems;
  readonly onChange: (key: K, value: string) => void;
}): JSX.Element {
  return (
    <>
      {props.specs.map((spec) => {
        const common = {
          id: spec.id,
          label: spec.label,
          value: props.values[spec.key],
          error: props.problems[spec.field],
          ...(spec.hint === undefined ? {} : { hint: spec.hint }),
          onValue: (value: string) => {
            props.onChange(spec.key, value);
          },
        };
        return spec.multiline === true ? (
          <LongText key={spec.id} {...common} />
        ) : (
          <TextInput
            key={spec.id}
            {...common}
            {...(spec.type === undefined ? {} : { type: spec.type })}
            {...(spec.inputMode === undefined ? {} : { inputMode: spec.inputMode })}
          />
        );
      })}
    </>
  );
}

/** Los campos como los pide el resumen de errores (FormSummary). */
export function summaryOf<K extends string>(
  specs: readonly FieldSpec<K>[],
): { field: string; id: string; label: string }[] {
  return specs.map((spec) => ({ field: spec.field, id: spec.id, label: spec.label }));
}

/** «12,5» o «12.5» como número; NaN si no se puede leer. */
export function decimal(text: string): number {
  const normalized = text.trim().replace(',', '.');
  return normalized === '' ? Number.NaN : Number(normalized);
}

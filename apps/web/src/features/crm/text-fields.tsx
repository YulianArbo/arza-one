'use client';

import { FormField } from '@arza/ui';
import type { JSX } from 'react';

// Campos de texto de los formularios del CRM (B22), descritos como datos: cada uno con su
// identificador, su etiqueta, su tipo y el campo del contrato del que muestra el problema.

export interface TextFieldSpec<K extends string> {
  readonly key: K;
  /** Campo del contrato cuyo problema se muestra, como «estimated_value». */
  readonly field: string;
  readonly id: string;
  readonly label: string;
  readonly type?: 'text' | 'date' | 'datetime-local' | 'email' | 'tel';
  readonly hint?: string;
  /** Teclado numérico con decimales en el celular, para los pesos. */
  readonly decimal?: boolean;
}

export function TextFields<K extends string>(props: {
  readonly specs: readonly TextFieldSpec<K>[];
  readonly values: Readonly<Record<K, string>>;
  readonly problems: Readonly<Record<string, string>>;
  readonly onChange: (key: K, text: string) => void;
}): JSX.Element {
  return (
    <>
      {props.specs.map((spec) => (
        <FormField
          key={spec.id}
          id={spec.id}
          label={spec.label}
          type={spec.type ?? 'text'}
          value={props.values[spec.key]}
          error={props.problems[spec.field] ?? null}
          {...(spec.hint === undefined ? {} : { hint: spec.hint })}
          {...(spec.decimal === true ? { inputMode: 'decimal' as const } : {})}
          onChange={(event) => {
            props.onChange(spec.key, event.target.value);
          }}
        />
      ))}
    </>
  );
}

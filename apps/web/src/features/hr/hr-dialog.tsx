'use client';

import { Button } from '@arza/ui';
import { useState, type JSX } from 'react';
import type { z } from 'zod';

import { FormError } from '../access/form-alert';
import { NewRecord } from '../finance/ledger-ui';
import { HrForm, type HrField } from './hr-form';
import { useHrAction } from './hr-queries';

// Piezas comunes de las pantallas de Talento humano del B36: un botón que abre un formulario en un
// diálogo y un botón de una acción directa (aprobar, retirar), ambos con su error en español.

/** Opciones de una lista a partir de sus etiquetas. */
export function optionsOf(
  labels: Readonly<Record<string, string>>,
): { readonly value: string; readonly label: string }[] {
  return Object.entries(labels).map(([value, label]) => ({ value, label }));
}

/** Texto vacío como nulo. */
export function orNull(value: string | undefined): string | null {
  return value === undefined || value.trim() === '' ? null : value;
}

/** Botón que abre un formulario en un diálogo; no se muestra si no está permitido. */
export function HrDialogForm<T>(props: {
  readonly allowed: boolean;
  readonly label: string;
  readonly title: string;
  readonly description: string;
  readonly fields: readonly HrField[];
  readonly schema: z.ZodType<T>;
  readonly prepare?: (values: Record<string, string>) => unknown;
  readonly run: (input: T, csrfToken: string) => Promise<unknown>;
  readonly submitLabel: string;
}): JSX.Element | null {
  return (
    <NewRecord
      allowed={props.allowed}
      label={props.label}
      title={props.title}
      description={props.description}
    >
      {(close) => (
        <HrForm
          fields={props.fields}
          schema={props.schema}
          {...(props.prepare === undefined ? {} : { prepare: props.prepare })}
          run={props.run}
          label={props.submitLabel}
          onDone={close}
        />
      )}
    </NewRecord>
  );
}

/** Botón de una acción directa sobre un registro, con su error. */
export function HrActionButton(props: {
  readonly label: string;
  readonly pendingLabel: string;
  readonly ariaLabel: string;
  readonly run: (csrfToken: string) => Promise<unknown>;
}): JSX.Element {
  const [done, setDone] = useState(false);
  const action = useHrAction<undefined>(
    (_input, csrfToken) => props.run(csrfToken),
    () => {
      setDone(true);
    },
  );
  return (
    <div className="flex flex-col gap-1">
      <Button
        type="button"
        size="sm"
        variant="outline"
        aria-label={props.ariaLabel}
        disabled={action.pending || done}
        onClick={() => {
          action.execute(undefined);
        }}
      >
        {action.pending ? props.pendingLabel : props.label}
      </Button>
      {action.error === null ? null : <FormError error={action.error} />}
      {action.dialog}
    </div>
  );
}

/** Lista simple con su texto cuando está vacía. */
export function HrList<T>(props: {
  readonly items: readonly T[];
  readonly empty: string;
  readonly render: (item: T) => JSX.Element;
  readonly keyOf: (item: T) => string;
}): JSX.Element {
  if (props.items.length === 0) return <p className="text-muted-foreground">{props.empty}</p>;
  return (
    <ul className="divide-y rounded-md border">
      {props.items.map((item) => (
        <li
          key={props.keyOf(item)}
          className="flex flex-wrap items-start justify-between gap-3 p-3"
        >
          {props.render(item)}
        </li>
      ))}
    </ul>
  );
}

/** Sección con título accesible. */
export function HrSection(props: {
  readonly id: string;
  readonly title: string;
  readonly children: React.ReactNode;
}): JSX.Element {
  return (
    <section aria-labelledby={`${props.id}-title`} className="space-y-3">
      <h2 id={`${props.id}-title`} className="text-section font-semibold">
        {props.title}
      </h2>
      {props.children}
    </section>
  );
}

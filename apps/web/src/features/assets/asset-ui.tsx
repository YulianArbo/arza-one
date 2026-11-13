'use client';

import { Button } from '@arza/ui';
import { useQuery, type UseQueryResult } from '@tanstack/react-query';
import { useState, type JSX } from 'react';
import type { z } from 'zod';

import { FormSummary } from '../../components/form-summary';
import { useApiClient } from '../../lib/api/api-provider';
import { FormError } from '../access/form-alert';
import { SubmitButton } from '../access/submit-button';
import { useAdminAction, type AdminAction } from '../administration/admin-action';
import { LedgerChoice, LedgerField, problemsOf, useValues } from '../finance/ledger-ui';

// Piezas comunes de las pantallas de Activos (B34): consultas, acciones auditadas y un formulario
// corto de campos de texto, fecha o lista que comparten la baja, la devolución, la anulación y los
// mantenimientos.

const ASSET_KEY = ['assets'] as const;

export function useAssetQuery<T>(
  path: string,
  schema: z.ZodType<T>,
  enabled = true,
): UseQueryResult<T> {
  const api = useApiClient();
  return useQuery({
    queryKey: [...ASSET_KEY, path],
    queryFn: ({ signal }) => api.get(path, { schema, signal }),
    enabled,
  });
}

export function useAssetAction<TArgs, TResult = unknown>(
  run: (args: TArgs, csrfToken: string) => Promise<TResult>,
  onSuccess?: (result: TResult) => void,
): AdminAction<TArgs, TResult> {
  return useAdminAction<TArgs, TResult>({
    run,
    invalidate: [ASSET_KEY],
    reason: 'Los cambios de Activos quedan en la auditoría.',
    ...(onSuccess === undefined ? {} : { onSuccess }),
  });
}

/** Botón de una acción directa sobre un registro, con su error. */
export function AssetButton(props: {
  readonly label: string;
  readonly pendingLabel: string;
  readonly ariaLabel: string;
  readonly run: (csrfToken: string) => Promise<unknown>;
}): JSX.Element {
  const action = useAssetAction<undefined>((_args, csrfToken) => props.run(csrfToken));
  return (
    <div className="flex flex-col gap-1">
      <Button
        type="button"
        size="sm"
        variant="outline"
        aria-label={props.ariaLabel}
        disabled={action.pending}
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

export interface ShortField {
  readonly field: string;
  readonly id: string;
  readonly label: string;
  readonly type?: 'text' | 'date';
  readonly decimal?: boolean;
  readonly hint?: string;
  /** Con opciones, el campo es una lista desplegable. */
  readonly options?: readonly { readonly value: string; readonly label: string }[];
}

interface ShortFormProps<T> {
  readonly fields: readonly ShortField[];
  readonly initial: Record<string, string>;
  readonly schema: z.ZodType<T>;
  /** Ajusta los textos antes de validar: coma decimal, vacío a null. */
  readonly prepare?: (values: Record<string, string>) => unknown;
  readonly submitLabel: string;
  readonly pendingLabel: string;
  readonly run: (body: T, csrfToken: string) => Promise<unknown>;
  readonly onDone: () => void;
}

function fieldProblem(field: ShortField, value: string, problem?: string): string | undefined {
  if (problem === undefined) return undefined;
  return field.type === 'date' && value === '' ? 'Escriba la fecha.' : problem;
}

/** Formulario corto: valida con el esquema del contrato y muestra cada problema junto a su campo. */
export function ShortForm<T>(props: ShortFormProps<T>): JSX.Element {
  const form = useValues(props.initial);
  const [problems, setProblems] = useState<Record<string, string>>({});
  const action = useAssetAction<T>(props.run, props.onDone);
  const submit = (): void => {
    const valid = props.schema.safeParse(props.prepare?.(form.values) ?? form.values);
    setProblems(valid.success ? {} : problemsOf(valid.error));
    if (valid.success) action.execute(valid.data);
  };
  return (
    <form
      noValidate
      className="flex flex-col gap-4"
      onSubmit={(event) => {
        event.preventDefault();
        submit();
      }}
    >
      <FormSummary problems={problems} fields={[...props.fields]} />
      {props.fields.map((field) => (
        <ShortFieldInput
          key={field.id}
          field={field}
          value={form.values[field.field] ?? ''}
          onChange={form.set(field.field)}
          error={fieldProblem(field, form.values[field.field] ?? '', problems[field.field])}
        />
      ))}
      {action.error === null ? null : <FormError error={action.error} />}
      <SubmitButton
        label={props.submitLabel}
        pendingLabel={props.pendingLabel}
        pending={action.pending}
      />
      {action.dialog}
    </form>
  );
}

function ShortFieldInput(props: {
  readonly field: ShortField;
  readonly value: string;
  readonly onChange: (value: string) => void;
  readonly error: string | undefined;
}): JSX.Element {
  const { field } = props;
  if (field.options !== undefined) {
    return (
      <LedgerChoice
        id={field.id}
        label={field.label}
        value={props.value}
        onChange={props.onChange}
        options={field.options}
        error={props.error}
      />
    );
  }
  return (
    <LedgerField
      id={field.id}
      label={field.label}
      value={props.value}
      onChange={props.onChange}
      error={props.error}
      {...(field.type === undefined ? {} : { type: field.type })}
      {...(field.decimal === true ? { decimal: true } : {})}
      {...(field.hint === undefined ? {} : { hint: field.hint })}
    />
  );
}

/** «1234,5» → «1234.5»: el valor en pesos como lo espera la API. */
export function moneyText(value: string): string {
  return value.trim().replace(',', '.');
}

/** Texto opcional: vacío es «sin dato». */
export function optionalText(value: string): string | null {
  return value.trim() === '' ? null : value;
}

/** Entradas de un mapa de etiquetas como opciones de una lista. */
export function optionsOf(
  labels: Readonly<Record<string, string>>,
): readonly { readonly value: string; readonly label: string }[] {
  return Object.entries(labels).map(([value, label]) => ({ value, label }));
}

'use client';

import { financeOptionsResponseSchema, type FinanceOptions } from '@arza/contracts';
import { Button, FormField, SelectField } from '@arza/ui';
import { useQuery, type UseQueryResult } from '@tanstack/react-query';
import { useState, type JSX, type ReactNode } from 'react';
import type { z } from 'zod';

import { useApiClient } from '../../lib/api/api-provider';
import { FormError } from '../access/form-alert';
import { useAdminAction, type AdminAction } from '../administration/admin-action';
import { RecordDialog } from '../organization/record-dialog';

// Piezas comunes de las pantallas del B32: consultas, acciones auditadas, campos y mensajes.

const LEDGER_KEY = ['finance', 'ledger'] as const;

export function useLedgerQuery<T>(
  path: string,
  schema: z.ZodType<T>,
  enabled = true,
): UseQueryResult<T> {
  const api = useApiClient();
  return useQuery({
    queryKey: [...LEDGER_KEY, path],
    queryFn: ({ signal }) => api.get(path, { schema, signal }),
    enabled,
  });
}

export function useLedgerAction<TArgs, TResult = unknown>(
  run: (args: TArgs, csrfToken: string) => Promise<TResult>,
  onSuccess?: (result: TResult) => void,
): AdminAction<TArgs, TResult> {
  return useAdminAction<TArgs, TResult>({
    run,
    invalidate: [LEDGER_KEY],
    reason: 'Los cambios de Finanzas quedan en la auditoría.',
    ...(onSuccess === undefined ? {} : { onSuccess }),
  });
}

export function useFinanceOptions(enabled = true): FinanceOptions | undefined {
  return useLedgerQuery('/v1/finance/options', financeOptionsResponseSchema, enabled).data?.data;
}

/**
 * Primer problema de cada campo, para mostrarlo junto al campo y en el resumen. `depth` elige qué
 * parte de la ruta nombra el campo: 2 para lines.N.campo.
 */
export function problemsOf(error: z.ZodError, depth = 0): Record<string, string> {
  const problems: Record<string, string> = {};
  for (const issue of error.issues) {
    const field = String(issue.path[depth] ?? 'form');
    problems[field] ??= issue.message;
  }
  return problems;
}

/** «2026-10» → «10/2026». */
export function monthLabel(period: string): string {
  const [year, month] = period.split('-');
  return `${month ?? ''}/${year ?? ''}`;
}

/** Campo de texto, fecha o mes con su mensaje. */
export function LedgerField(props: {
  readonly id: string;
  readonly label: string;
  readonly value: string;
  readonly onChange: (value: string) => void;
  readonly error?: string | undefined;
  readonly type?: 'text' | 'date' | 'month';
  readonly decimal?: boolean;
  readonly hint?: string;
}): JSX.Element {
  return (
    <FormField
      id={props.id}
      label={props.label}
      type={props.type ?? 'text'}
      value={props.value}
      error={props.error ?? null}
      {...(props.hint === undefined ? {} : { hint: props.hint })}
      {...(props.decimal === true ? { inputMode: 'decimal' as const } : {})}
      onChange={(event) => {
        props.onChange(event.target.value);
      }}
    />
  );
}

/** Lista desplegable con una primera opción vacía «Seleccione…». */
export function LedgerChoice(props: {
  readonly id: string;
  readonly label: string;
  readonly value: string;
  readonly onChange: (value: string) => void;
  readonly options: readonly { readonly value: string; readonly label: string }[];
  readonly error?: string | undefined;
  readonly placeholder?: string;
}): JSX.Element {
  return (
    <SelectField
      id={props.id}
      label={props.label}
      value={props.value}
      error={props.error}
      options={[{ value: '', label: props.placeholder ?? 'Seleccione…' }, ...props.options]}
      onChange={(event) => {
        props.onChange(event.target.value);
      }}
    />
  );
}

/** Botón de una acción sobre un registro (aprobar, cerrar), con su error. */
export function ActionButton(props: {
  readonly label: string;
  readonly pendingLabel: string;
  readonly ariaLabel: string;
  readonly run: (csrfToken: string) => Promise<unknown>;
}): JSX.Element {
  const [done, setDone] = useState(false);
  const action = useLedgerAction<undefined>(
    (_args, csrfToken) => props.run(csrfToken),
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

interface ChoiceProps {
  readonly id: string;
  readonly value: string;
  readonly onChange: (value: string) => void;
  readonly error?: string | undefined;
}

/** Centro de costo activo, de las opciones de Finanzas. */
export function CostCenterChoice(props: ChoiceProps): JSX.Element {
  const options = useFinanceOptions();
  return (
    <LedgerChoice
      {...props}
      label="Centro de costo"
      options={(options?.cost_centers ?? []).map((center) => ({
        value: center.id,
        label: `${center.code} · ${center.name}`,
      }))}
    />
  );
}

/** Rubro activo del catálogo de gastos y presupuesto. */
export function CategoryChoice(props: ChoiceProps): JSX.Element {
  const options = useFinanceOptions();
  return (
    <LedgerChoice
      {...props}
      label="Rubro"
      options={(options?.categories ?? []).map((item) => ({ value: item.code, label: item.label }))}
    />
  );
}

export interface FormValues<T> {
  readonly values: T;
  readonly set: (name: keyof T) => (value: string) => void;
  readonly reset: () => void;
}

/** Valores de un formulario de texto, con un cambiador por campo. */
export function useValues<T extends Record<string, string>>(initial: T): FormValues<T> {
  const [values, setValues] = useState(initial);
  const set = (name: keyof T) => (value: string) => {
    setValues((current) => ({ ...current, [name]: value }));
  };
  return {
    values,
    set,
    reset: () => {
      setValues(initial);
    },
  };
}

/** Botón «Nuevo…» que abre el formulario en un diálogo, solo con el permiso indicado. */
export function NewRecord(props: {
  readonly allowed: boolean;
  readonly label: string;
  readonly title: string;
  readonly description: string;
  /** Abre el formulario al llegar a la pantalla. */
  readonly startOpen?: boolean;
  /** «outline» cuando la pantalla ya tiene otra acción principal (una sola, B22A). */
  readonly variant?: 'primary' | 'outline';
  readonly children: (close: () => void) => ReactNode;
}): JSX.Element | null {
  if (!props.allowed) return null;
  return (
    <div>
      <RecordDialog
        triggerLabel={props.label}
        title={props.title}
        description={props.description}
        {...(props.startOpen === undefined ? {} : { startOpen: props.startOpen })}
        {...(props.variant === undefined ? {} : { variant: props.variant })}
      >
        {props.children}
      </RecordDialog>
    </div>
  );
}

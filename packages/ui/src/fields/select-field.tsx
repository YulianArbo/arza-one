import type { ComponentProps, JSX } from 'react';

import { Label } from '../components/label.js';
import { Select } from '../components/select.js';

interface SelectFieldProps extends Omit<ComponentProps<'select'>, 'id'> {
  readonly id: string;
  readonly label: string;
  readonly hint?: string | undefined;
  /** Mensaje del problema; se anuncia al lector de pantalla (16.6). */
  readonly error?: string | undefined;
  readonly options: readonly { readonly value: string; readonly label: string }[];
}

/** Lista desplegable con etiqueta visible y ayuda asociada (16.4 y 16.6). */
export function SelectField({
  id,
  label,
  hint,
  error,
  options,
  ...select
}: SelectFieldProps): JSX.Element {
  const hintId = hint === undefined ? undefined : `${id}-ayuda`;
  const errorId = error === undefined ? undefined : `${id}-error`;
  const describedBy = [hintId, errorId].filter(Boolean).join(' ') || undefined;
  return (
    <div className="flex flex-col gap-1.5">
      <Label htmlFor={id}>{label}</Label>
      <Select
        id={id}
        aria-describedby={describedBy}
        aria-invalid={error === undefined ? undefined : true}
        {...select}
      >
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </Select>
      {hint === undefined ? null : (
        <p id={hintId} className="text-xs text-muted-foreground">
          {hint}
        </p>
      )}
      {error === undefined ? null : (
        <p id={errorId} className="text-xs font-medium text-destructive">
          {error}
        </p>
      )}
    </div>
  );
}

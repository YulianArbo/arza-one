import { Label } from '@arza/ui';
import type { ComponentProps, JSX } from 'react';

interface SelectFieldProps extends Omit<ComponentProps<'select'>, 'id'> {
  readonly id: string;
  readonly label: string;
  readonly hint?: string | undefined;
  readonly options: readonly { readonly value: string; readonly label: string }[];
}

/** Lista desplegable con etiqueta visible y ayuda asociada (16.4 y 16.6). */
export function SelectField({
  id,
  label,
  hint,
  options,
  ...select
}: SelectFieldProps): JSX.Element {
  const hintId = hint === undefined ? undefined : `${id}-ayuda`;
  return (
    <div className="flex flex-col gap-1.5">
      <Label htmlFor={id}>{label}</Label>
      <select
        id={id}
        aria-describedby={hintId}
        className="flex h-9 w-full rounded-md border border-input bg-card px-3 py-1 text-sm text-foreground shadow-sm disabled:cursor-not-allowed disabled:opacity-60"
        {...select}
      >
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
      {hint === undefined ? null : (
        <p id={hintId} className="text-xs text-muted-foreground">
          {hint}
        </p>
      )}
    </div>
  );
}

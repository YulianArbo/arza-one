import { Input, Label } from '@arza/ui';
import type { ComponentProps, JSX } from 'react';

interface FormFieldProps extends Omit<ComponentProps<'input'>, 'id'> {
  readonly id: string;
  readonly label: string;
  /** Ayuda breve debajo del campo (16.4). */
  readonly hint?: string;
  /** Mensaje del problema; se anuncia al lector de pantalla (16.6). */
  readonly error?: string | null;
}

/** Campo con etiqueta visible, ayuda y mensaje de error asociados por aria-describedby. */
export function FormField({ id, label, hint, error, ...input }: FormFieldProps): JSX.Element {
  const hintId = hint === undefined ? undefined : `${id}-ayuda`;
  const errorId = error ? `${id}-error` : undefined;
  const describedBy = [hintId, errorId].filter(Boolean).join(' ') || undefined;
  return (
    <div className="flex flex-col gap-1.5">
      <Label htmlFor={id}>{label}</Label>
      <Input
        id={id}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy}
        {...input}
      />
      {hint === undefined ? null : (
        <p id={hintId} className="text-xs text-muted-foreground">
          {hint}
        </p>
      )}
      {error ? (
        <p id={errorId} className="text-xs font-medium text-destructive">
          {error}
        </p>
      ) : null}
    </div>
  );
}

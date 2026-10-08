import type { JSX } from 'react';

import { FormField } from './form-field';

interface CurrentPasswordFieldProps {
  readonly id: string;
  readonly label: string;
  readonly value: string;
  readonly onChange: (value: string) => void;
  /** Mensaje si falta, después de intentar enviar. */
  readonly missingMessage: string | null;
}

/** Contraseña que la persona ya tiene (iniciar sesión o confirmar un cambio). */
export function CurrentPasswordField({
  id,
  label,
  value,
  onChange,
  missingMessage,
}: CurrentPasswordFieldProps): JSX.Element {
  return (
    <FormField
      id={id}
      label={label}
      type="password"
      autoComplete="current-password"
      value={value}
      onChange={(event) => {
        onChange(event.target.value);
      }}
      error={value === '' ? missingMessage : null}
    />
  );
}

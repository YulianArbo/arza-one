import { FormField } from '@arza/ui';
import type { JSX } from 'react';

interface EmailFieldProps {
  readonly value: string;
  readonly onChange: (value: string) => void;
  /** Muestra que falta, después de intentar enviar. */
  readonly showMissing: boolean;
  /** username al iniciar sesión (los gestores de contraseñas lo reconocen); email al recuperar. */
  readonly autoComplete: 'username' | 'email';
}

export function EmailField({
  value,
  onChange,
  showMissing,
  autoComplete,
}: EmailFieldProps): JSX.Element {
  return (
    <FormField
      id="correo"
      label="Correo electrónico"
      type="email"
      autoComplete={autoComplete}
      value={value}
      onChange={(event) => {
        onChange(event.target.value);
      }}
      error={showMissing && value.trim() === '' ? 'Escriba su correo.' : null}
    />
  );
}

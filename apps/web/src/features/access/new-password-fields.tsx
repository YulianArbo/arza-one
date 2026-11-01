'use client';

import { FormField } from '@arza/ui';
import { useState, type JSX } from 'react';

import { NEW_PASSWORD_HINT, confirmationError, newPasswordError } from './password-checks';
import { PasswordStrength } from './password-strength';

export interface NewPasswordState {
  readonly password: string;
  readonly confirmation: string;
  readonly setPassword: (value: string) => void;
  readonly setConfirmation: (value: string) => void;
  /** Muestra los problemas aunque la persona no haya salido de los campos (al enviar). */
  readonly revealAll: () => void;
  readonly touch: (field: 'password' | 'confirmation') => void;
  readonly valid: boolean;
  readonly passwordError: string | null;
  readonly confirmationError: string | null;
}

/** Estado de «contraseña nueva» y «repítala», validado al salir del campo y al enviar (16.4). */
export function useNewPassword(): NewPasswordState {
  const [password, setPassword] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [touched, setTouched] = useState({ password: false, confirmation: false });
  const passwordProblem = newPasswordError(password);
  const confirmationProblem = confirmationError(password, confirmation);
  return {
    password,
    confirmation,
    setPassword,
    setConfirmation,
    revealAll: () => {
      setTouched({ password: true, confirmation: true });
    },
    touch: (field) => {
      setTouched((current) => ({ ...current, [field]: true }));
    },
    valid: passwordProblem === null && confirmationProblem === null,
    passwordError: touched.password ? passwordProblem : null,
    confirmationError: touched.confirmation ? confirmationProblem : null,
  };
}

interface NewPasswordFieldsProps {
  readonly state: NewPasswordState;
  readonly label?: string;
}

export function NewPasswordFields({
  state,
  label = 'Contraseña nueva',
}: NewPasswordFieldsProps): JSX.Element {
  return (
    <>
      <FormField
        id="contrasena-nueva"
        label={label}
        type="password"
        autoComplete="new-password"
        hint={NEW_PASSWORD_HINT}
        value={state.password}
        onChange={(event) => {
          state.setPassword(event.target.value);
        }}
        onBlur={() => {
          state.touch('password');
        }}
        error={state.passwordError}
      />
      <PasswordStrength password={state.password} />
      <FormField
        id="contrasena-repetida"
        label="Repita la contraseña"
        type="password"
        autoComplete="new-password"
        value={state.confirmation}
        onChange={(event) => {
          state.setConfirmation(event.target.value);
        }}
        onBlur={() => {
          state.touch('confirmation');
        }}
        error={state.confirmationError}
      />
    </>
  );
}

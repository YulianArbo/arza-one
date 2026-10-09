import { Button } from '@arza/ui';
import { useState, type JSX } from 'react';

import { FormField } from '../access/form-field';

interface CodeFieldProps {
  readonly id: string;
  readonly value: string;
  readonly onChange: (value: string) => void;
  /** Mensaje si falta, después de intentar enviar. */
  readonly missingMessage: string | null;
}

/** Los seis dígitos de la aplicación del celular. El teclado del celular muestra solo números. */
export function TotpCodeField({
  id,
  value,
  onChange,
  missingMessage,
}: CodeFieldProps): JSX.Element {
  return (
    <FormField
      id={id}
      label="Código de seis dígitos"
      hint="Ábralo en su aplicación de autenticación. Cambia cada 30 segundos."
      inputMode="numeric"
      autoComplete="one-time-code"
      maxLength={7}
      value={value}
      onChange={(event) => {
        onChange(event.target.value);
      }}
      error={value.trim() === '' ? missingMessage : null}
    />
  );
}

/** Uno de los diez códigos de recuperación, con o sin guiones. */
export function RecoveryCodeField({
  id,
  value,
  onChange,
  missingMessage,
}: CodeFieldProps): JSX.Element {
  return (
    <FormField
      id={id}
      label="Código de recuperación"
      hint="Uno de los diez que guardó al configurar el segundo factor. Cada uno sirve una vez."
      autoComplete="off"
      autoCapitalize="characters"
      spellCheck={false}
      maxLength={24}
      value={value}
      onChange={(event) => {
        onChange(event.target.value);
      }}
      error={value.trim() === '' ? missingMessage : null}
    />
  );
}

/** Lo que la API recibe: el código del celular o uno de recuperación. */
export function secondFactorProof(
  useRecovery: boolean,
  value: string,
): { code: string } | { recovery_code: string } {
  return useRecovery ? { recovery_code: value.trim() } : { code: value.replace(/\s/g, '') };
}

interface ProofFieldsProps {
  readonly idPrefix: string;
  readonly useRecovery: boolean;
  readonly onToggle: () => void;
  readonly value: string;
  readonly onChange: (value: string) => void;
  readonly missingMessage: string | null;
  /** Texto del enlace para cambiar al código de recuperación. */
  readonly recoveryLabel: string;
}

/** El código del celular o, si no lo tiene a mano, uno de recuperación. */
export function SecondFactorProofFields({
  idPrefix,
  useRecovery,
  onToggle,
  recoveryLabel,
  ...field
}: ProofFieldsProps): JSX.Element {
  return (
    <>
      {useRecovery ? (
        <RecoveryCodeField id={`${idPrefix}-recuperacion`} {...field} />
      ) : (
        <TotpCodeField id={`${idPrefix}-codigo`} {...field} />
      )}
      <Button
        type="button"
        variant="link"
        className="h-auto self-start px-0 text-left whitespace-normal"
        onClick={onToggle}
      >
        {useRecovery ? 'Usar el código de la aplicación' : recoveryLabel}
      </Button>
    </>
  );
}

/** Estado del campo del segundo factor: lo escrito y si es un código de recuperación. */
export function useProofInput(): {
  value: string;
  setValue: (value: string) => void;
  useRecovery: boolean;
  toggle: () => void;
} {
  const [value, setValue] = useState('');
  const [useRecovery, setUseRecovery] = useState(false);
  const toggle = (): void => {
    setUseRecovery(!useRecovery);
    setValue('');
  };
  return { value, setValue, useRecovery, toggle };
}

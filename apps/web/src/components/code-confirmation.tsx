'use client';

import { FormField } from '@arza/ui';
import {
  useId,
  useRef,
  useState,
  type JSX,
  type ReactNode,
  type Ref,
  type SyntheticEvent,
} from 'react';

// Confirmación reforzada de una acción irreversible de alto impacto (numeral 16.5, B22B): antes de
// enviar, la persona escribe el código del registro. Aprobado por el dueño el 20/11/2026 para
// terminar un contrato, anular una factura, dar de baja un activo y aprobar la disposición final.

/** El código escrito coincide con el del registro, sin importar espacios ni mayúsculas. */
export function codeMatches(typed: string, code: string): boolean {
  return typed.trim().toLocaleUpperCase('es-CO') === code.trim().toLocaleUpperCase('es-CO');
}

/** Mensaje cuando el código escrito no coincide. */
function codeMismatch(code: string): string {
  return `Escriba el código ${code} tal como aparece para confirmar.`;
}

interface CodeFieldProps {
  readonly code: string;
  readonly value: string;
  readonly error: string | null;
  readonly onChange: (value: string) => void;
  readonly inputRef?: Ref<HTMLInputElement>;
}

/** Campo «Para confirmar, escriba el código …», con su error junto al campo. */
function CodeField({ code, value, error, onChange, inputRef }: CodeFieldProps): JSX.Element {
  const id = useId();
  return (
    <FormField
      id={`confirmar-${id}`}
      label={`Para confirmar, escriba el código ${code}`}
      hint="Esta acción no se puede deshacer."
      value={value}
      autoComplete="off"
      spellCheck={false}
      ref={inputRef}
      onChange={(event) => {
        onChange(event.target.value);
      }}
      error={error}
    />
  );
}

/**
 * Envuelve el formulario de la acción: pone el campo del código arriba y detiene el envío si no
 * coincide. El formulario no cambia; su envío solo sigue cuando el código es el correcto.
 */
export function CodeConfirmation({
  code,
  children,
}: {
  readonly code: string;
  readonly children: ReactNode;
}): JSX.Element {
  const [typed, setTyped] = useState('');
  const [error, setError] = useState<string | null>(null);
  const input = useRef<HTMLInputElement>(null);
  const guard = (event: SyntheticEvent): void => {
    if (codeMatches(typed, code)) return;
    event.preventDefault();
    event.stopPropagation();
    setError(codeMismatch(code));
    input.current?.focus();
  };
  return (
    <div className="flex flex-col gap-4" onSubmitCapture={guard}>
      <CodeField
        code={code}
        value={typed}
        error={error}
        inputRef={input}
        onChange={(value) => {
          setTyped(value);
          setError(null);
        }}
      />
      {children}
    </div>
  );
}

/**
 * Código opcional dentro de una ventana de confirmación: devuelve el campo (o nada, si no se pide
 * código) y `allow`, que dice si se puede confirmar y, si no, muestra el error.
 */
export function useCodeCheck(code: string | undefined): {
  readonly field: JSX.Element | null;
  readonly allow: () => boolean;
} {
  const [typed, setTyped] = useState('');
  const [error, setError] = useState<string | null>(null);
  if (code === undefined) return { field: null, allow: () => true };
  const field = (
    <CodeField
      code={code}
      value={typed}
      error={error}
      onChange={(value) => {
        setTyped(value);
        setError(null);
      }}
    />
  );
  const allow = (): boolean => {
    if (codeMatches(typed, code)) return true;
    setError(codeMismatch(code));
    return false;
  };
  return { field, allow };
}

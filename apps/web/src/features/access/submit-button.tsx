'use client';

import { Button } from '@arza/ui';
import type { JSX } from 'react';

import { useHydrated } from '../../lib/hydration/use-hydrated';

interface SubmitButtonProps {
  readonly label: string;
  readonly pendingLabel: string;
  /** La petición está en curso. */
  readonly pending: boolean;
  /** Ya terminó bien y la pantalla va a cambiar: no se envía dos veces. */
  readonly done?: boolean;
  readonly className?: string;
}

/** Botón de enviar un formulario; espera a que la página cargue su lógica (useHydrated). */
export function SubmitButton({
  label,
  pendingLabel,
  pending,
  done = false,
  className,
}: SubmitButtonProps): JSX.Element {
  const hydrated = useHydrated();
  return (
    <Button type="submit" className={className} disabled={!hydrated || pending || done}>
      {pending ? pendingLabel : label}
    </Button>
  );
}

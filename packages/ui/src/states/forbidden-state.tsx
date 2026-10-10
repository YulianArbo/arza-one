import { Lock } from 'lucide-react';
import type { JSX } from 'react';

export interface ForbiddenStateProps {
  /** A quién pedir el acceso, con su artículo: «al administrador…», «a la Dirección». */
  whomToAsk?: string;
}

/**
 * Sin permiso: explica que no tiene acceso y a quién pedirlo, sin mostrar ningún dato (16.5).
 * La interfaz solo informa; quien niega el acceso es siempre la API.
 */
export function ForbiddenState({
  whomToAsk = 'al administrador de la plataforma',
}: ForbiddenStateProps): JSX.Element {
  return (
    <div
      role="alert"
      className="flex flex-col items-center gap-3 rounded-lg border bg-card px-6 py-10 text-center"
    >
      <Lock aria-hidden="true" className="size-8 text-muted-foreground" />
      <h2 className="text-base font-semibold">No tiene acceso a esta sección</h2>
      <p className="max-w-prose text-sm text-muted-foreground">
        Su usuario no tiene el permiso necesario. Si lo necesita para su trabajo, solicítelo{' '}
        {whomToAsk}.
      </p>
    </div>
  );
}

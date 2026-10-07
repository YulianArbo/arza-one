'use client';

import { ErrorState } from '@arza/ui';
import type { JSX } from 'react';

/** Falla inesperada al mostrar una pantalla: mensaje en español y botón de reintento (16.5). */
export default function AppError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}): JSX.Element {
  return (
    <ErrorState
      title="No pudimos mostrar esta pantalla"
      message="Ocurrió un error inesperado. Intente de nuevo; si el problema continúa, comuníquese con soporte."
      correlationId={error.digest}
      onRetry={reset}
    />
  );
}

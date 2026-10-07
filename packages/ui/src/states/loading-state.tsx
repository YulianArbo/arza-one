import type { JSX } from 'react';

import { Skeleton } from '../components/skeleton.js';

export interface LoadingStateProps {
  /** Qué se está cargando, para el lector de pantalla. */
  label?: string;
  rows?: number;
}

/** Esqueleto del contenido mientras carga: nunca una pantalla en blanco (16.5). */
export function LoadingState({
  label = 'Cargando la información',
  rows = 3,
}: LoadingStateProps): JSX.Element {
  return (
    <div role="status" aria-live="polite" className="flex flex-col gap-3">
      <span className="sr-only">{label}…</span>
      <Skeleton className="h-6 w-1/3" />
      {Array.from({ length: rows }, (_, index) => (
        <Skeleton key={index} className="h-10 w-full" />
      ))}
    </div>
  );
}

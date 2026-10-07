import { CircleAlert, RotateCw } from 'lucide-react';
import type { JSX } from 'react';

import { Button } from '../components/button.js';

export interface ErrorStateProps {
  title?: string;
  /** Mensaje claro en español; dice qué pasó y qué hacer. */
  message: string;
  /** Identificador de correlación de la API, para que soporte encuentre el caso. */
  correlationId?: string | undefined;
  onRetry?: () => void;
}

/** Error con mensaje en español, código para soporte y botón de reintento (16.5). */
export function ErrorState({
  title = 'No pudimos cargar la información',
  message,
  correlationId,
  onRetry,
}: ErrorStateProps): JSX.Element {
  return (
    <div
      role="alert"
      className="flex flex-col items-start gap-3 rounded-lg border border-destructive bg-card p-6"
    >
      <h2 className="flex items-center gap-2 text-base font-semibold">
        <CircleAlert aria-hidden="true" className="size-5 text-destructive" />
        {title}
      </h2>
      <p className="text-sm">{message}</p>
      {correlationId ? (
        <p className="text-xs text-muted-foreground">
          Si el problema continúa, comuníquese con soporte y dé este código:{' '}
          <code className="font-mono text-foreground select-all">{correlationId}</code>
        </p>
      ) : null}
      {onRetry ? (
        <Button variant="outline" onClick={onRetry}>
          <RotateCw aria-hidden="true" />
          Reintentar
        </Button>
      ) : null}
    </div>
  );
}

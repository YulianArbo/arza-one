import { Alert, AlertDescription, AlertTitle } from '@arza/ui';
import { CircleAlert, CircleCheck } from 'lucide-react';
import type { JSX } from 'react';

import { ApiError, CLIENT_ERROR_MESSAGES } from '../../lib/api/api-error';

/** Problema al enviar un formulario, anunciado al lector de pantalla (16.5 y 16.6). */
export function FormError({ error }: { readonly error: unknown }): JSX.Element {
  const apiError = error instanceof ApiError ? error : undefined;
  const showCorrelation = apiError?.isTransient === true && apiError.correlationId !== undefined;
  return (
    <Alert tone="destructive" role="alert">
      <CircleAlert aria-hidden="true" />
      <AlertTitle>No se pudo completar</AlertTitle>
      <AlertDescription>
        <p>{apiError?.message ?? CLIENT_ERROR_MESSAGES.unexpected}</p>
        {showCorrelation ? <p>Código para soporte: {apiError.correlationId}</p> : null}
      </AlertDescription>
    </Alert>
  );
}

/** Confirmación breve y no intrusiva (16.5). */
export function FormSuccess({ message }: { readonly message: string }): JSX.Element {
  return (
    <Alert tone="success">
      <CircleCheck aria-hidden="true" />
      <AlertDescription>{message}</AlertDescription>
    </Alert>
  );
}

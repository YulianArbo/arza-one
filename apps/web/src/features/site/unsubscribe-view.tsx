'use client';

import { unsubscribeResultSchema } from '@arza/contracts';
import { Alert, AlertDescription, LoadingState } from '@arza/ui';
import { useQuery } from '@tanstack/react-query';
import type { JSX } from 'react';

import { useApiClient } from '../../lib/api/api-provider';
import { FormError } from '../access/form-alert';
import { useLinkToken } from '../access/link-token';

// Baja de comunicaciones comerciales en un clic (B41, decisión 9): abrir el enlace del correo
// basta. La llave va en el cuerpo de la petición; la API la acepta una sola vez y, si se vuelve a
// abrir, responde que la baja ya estaba hecha.

function Unsubscribe({ token }: { readonly token: string }): JSX.Element {
  const api = useApiClient();
  // Una consulta (y no una acción) para que la pantalla no la envíe dos veces al montarse.
  const query = useQuery({
    queryKey: ['site', 'unsubscribe', token],
    retry: false,
    staleTime: Infinity,
    queryFn: () =>
      api.post('/v1/public/unsubscribe', { body: { token }, schema: unsubscribeResultSchema }),
  });
  if (query.isError) return <FormError error={query.error} />;
  if (query.data === undefined) return <LoadingState label="Registrando su baja" />;
  return (
    <Alert tone="success">
      <AlertDescription className="flex flex-col gap-2">
        <span>
          {query.data.already
            ? `El correo ${query.data.email} ya estaba dado de baja.`
            : `Listo: el correo ${query.data.email} no recibirá más comunicaciones comerciales.`}
        </span>
        <span className="text-muted-foreground">
          Seguirá recibiendo solo los mensajes necesarios para atender sus solicitudes.
        </span>
      </AlertDescription>
    </Alert>
  );
}

export function UnsubscribeView(): JSX.Element {
  const token = useLinkToken();
  if (token === undefined) return <LoadingState label="Abriendo el enlace" />;
  if (token === null) {
    return (
      <Alert tone="warning">
        <AlertDescription>
          El enlace no está completo. Ábralo tal como llegó en el correo.
        </AlertDescription>
      </Alert>
    );
  }
  return <Unsubscribe token={token} />;
}

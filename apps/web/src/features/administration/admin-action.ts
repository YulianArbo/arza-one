'use client';

import { useMutation, useQueryClient, type QueryKey } from '@tanstack/react-query';
import type { JSX } from 'react';

import { needsReauthentication, useReauthentication } from '../second-factor/reauthentication';
import { isUnauthenticated, useSession } from '../session/session-provider';

const ADMIN_REASON = 'Esta acción cambia los accesos de otras personas.';

interface AdminActionOptions<TArgs, TResult> {
  /** Llama a la API con el código antifalsificación de la sesión. */
  readonly run: (args: TArgs, csrfToken: string) => Promise<TResult>;
  /** Consultas que se recargan al terminar, para que la pantalla refleje el cambio (16.5). */
  readonly invalidate: readonly QueryKey[];
  readonly onSuccess?: (result: TResult, args: TArgs) => void;
}

export interface AdminAction<TArgs, TResult> {
  readonly execute: (args: TArgs) => void;
  readonly pending: boolean;
  /** Error para mostrar; la petición de confirmar la identidad no cuenta como error. */
  readonly error: unknown;
  readonly result: TResult | undefined;
  readonly reset: () => void;
  /** Ventana «Confirme que es usted», que hay que poner en la pantalla. */
  readonly dialog: JSX.Element;
}

/**
 * Acción de administración: si la API pide confirmar la identidad (acciones de alto riesgo,
 * numeral 15.1), abre la ventana y la repite al confirmar; si la sesión venció, pide entrar.
 */
export function useAdminAction<TArgs, TResult = void>(
  options: AdminActionOptions<TArgs, TResult>,
): AdminAction<TArgs, TResult> {
  const { session, endSession } = useSession();
  const queryClient = useQueryClient();
  const reauth = useReauthentication(session, ADMIN_REASON);
  const mutation = useMutation({
    mutationFn: (args: TArgs) => options.run(args, session.csrf_token),
    onSuccess: (result, args) => {
      options.onSuccess?.(result, args);
    },
    onSettled: () => {
      for (const key of options.invalidate) void queryClient.invalidateQueries({ queryKey: key });
    },
  });
  const execute = (args: TArgs): void => {
    mutation.mutate(args, {
      onError: (error) => {
        if (isUnauthenticated(error)) endSession('sesion-vencida');
        else
          reauth.handle(error, () => {
            execute(args);
          });
      },
    });
  };
  const error = mutation.isError && !needsReauthentication(mutation.error) ? mutation.error : null;
  return {
    execute,
    pending: mutation.isPending,
    error,
    result: mutation.data,
    reset: mutation.reset,
    dialog: reauth.dialog,
  };
}

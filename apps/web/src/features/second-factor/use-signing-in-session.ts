'use client';

import type { SessionResponse, SignInStage } from '@arza/contracts';
import { useRouter, useSearchParams } from 'next/navigation';
import { useEffect } from 'react';

import { loginPath, safeReturnPath, secondFactorPath } from '../session/access-routes';
import { isUnauthenticated, useSessionQuery } from '../session/session-provider';

type PendingStage = Exclude<SignInStage, 'complete'>;

/** A dónde debe ir esta sesión si no está en la etapa que atiende la pantalla; null si se queda. */
function redirectFor(
  session: SessionResponse,
  expected: PendingStage,
  allowComplete: boolean,
  returnTo: string | null,
): string | null {
  if (session.stage === expected) return null;
  if (session.stage === 'complete') {
    return allowComplete ? null : safeReturnPath(returnTo, session.user.kind);
  }
  return secondFactorPath(session.stage, returnTo);
}

export interface SigningInSession {
  readonly query: ReturnType<typeof useSessionQuery>;
  /** La sesión está en la etapa de esta pantalla (o completa, si la pantalla lo permite). */
  readonly ready: SessionResponse | null;
  readonly returnTo: string | null;
}

/**
 * Sesión de las pantallas del segundo paso (B09). Sin sesión lleva a iniciar sesión; si la sesión
 * está en otra etapa, a la pantalla que le corresponde. La API vuelve a comprobarlo todo.
 */
export function useSigningInSession(
  expected: PendingStage,
  allowComplete = false,
): SigningInSession {
  const query = useSessionQuery();
  const router = useRouter();
  const returnTo = useSearchParams().get('volver');
  const session = query.data;
  const target =
    session === undefined ? null : redirectFor(session, expected, allowComplete, returnTo);
  const unauthenticated = isUnauthenticated(query.error);

  useEffect(() => {
    if (unauthenticated) router.replace(loginPath('sesion-vencida'));
    else if (target !== null) router.replace(target);
  }, [unauthenticated, target, router]);

  const ready = session !== undefined && target === null ? session : null;
  return { query, ready, returnTo };
}

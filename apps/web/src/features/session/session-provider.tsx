'use client';

import { sessionResponseSchema, type SessionResponse, type UserKind } from '@arza/contracts';
import { ErrorState, LoadingState } from '@arza/ui';
import { useQuery, useQueryClient, type UseQueryResult } from '@tanstack/react-query';
import { usePathname, useRouter } from 'next/navigation';
import {
  createContext,
  use,
  useCallback,
  useEffect,
  useMemo,
  type JSX,
  type ReactNode,
} from 'react';

import { ApiError, CLIENT_ERROR_MESSAGES } from '../../lib/api/api-error';
import { useApiClient } from '../../lib/api/api-provider';
import { homeFor, loginPath, secondFactorPath, type LoginNotice } from './access-routes';

export const SESSION_QUERY_KEY = ['session'] as const;
const SESSION_PATH = '/v1/auth/session';

export interface SessionValue {
  readonly session: SessionResponse;
  /** Cierra la sesión en la API y lleva a la pantalla de inicio de sesión. */
  readonly logout: () => Promise<void>;
  /** Olvida la sesión en la web y lleva a iniciar sesión con el aviso dado. */
  readonly endSession: (notice: LoginNotice) => void;
}

const SessionContext = createContext<SessionValue | null>(null);

/** Sesión actual. Solo dentro de RequireSession. */
export function useSession(): SessionValue {
  const value = use(SessionContext);
  if (value === null) throw new Error('useSession debe usarse dentro de RequireSession');
  return value;
}

export function isUnauthenticated(error: unknown): boolean {
  return error instanceof ApiError && error.isUnauthenticated;
}

/** Sesión actual, también la que está a medias (le falta el segundo factor). */
export function useSessionQuery(): UseQueryResult<SessionResponse> {
  const api = useApiClient();
  return useQuery({
    queryKey: SESSION_QUERY_KEY,
    queryFn: ({ signal }) => api.get(SESSION_PATH, { schema: sessionResponseSchema, signal }),
    // Sin sesión no hay nada que reintentar: se pide iniciar sesión.
    retry: (failureCount, error) => !isUnauthenticated(error) && failureCount < 1,
    staleTime: Number.POSITIVE_INFINITY,
  });
}

function useSessionActions(session: SessionResponse | undefined) {
  const api = useApiClient();
  const router = useRouter();
  const queryClient = useQueryClient();
  const endSession = useCallback(
    (notice: LoginNotice) => {
      queryClient.removeQueries({ queryKey: SESSION_QUERY_KEY });
      queryClient.clear();
      router.replace(loginPath(notice));
    },
    [queryClient, router],
  );
  const csrfToken = session?.csrf_token ?? '';
  const logout = useCallback(async () => {
    try {
      await api.post('/v1/auth/logout', { body: {}, csrfToken });
    } catch (error) {
      // Si la sesión ya había vencido, el resultado es el mismo: no hay sesión.
      if (!isUnauthenticated(error)) throw error;
    }
    endSession('sesion-cerrada');
  }, [api, endSession, csrfToken]);
  return { endSession, logout };
}

interface RequireSessionProps {
  /** Quién puede usar esta superficie: la aplicación interna o el portal del cliente. */
  readonly kind: UserKind;
  readonly children: ReactNode;
}

/**
 * Muestra su contenido solo con una sesión válida y completa (numeral 16.5): sin sesión lleva a
 * iniciar sesión, y a una sesión a la que le falta el segundo factor, a escribir el código o a
 * configurarlo (B09); en ambos casos luego regresa a la misma pantalla. A quien pertenece a la
 * otra superficie lo lleva a la suya. La API sigue siendo la única barrera de seguridad.
 */
export function RequireSession({ kind, children }: RequireSessionProps): JSX.Element {
  const query = useSessionQuery();
  const { endSession, logout } = useSessionActions(query.data);
  const router = useRouter();
  const pathname = usePathname();
  const unauthenticated = isUnauthenticated(query.error);
  const sessionKind = query.data?.user.kind;
  const stage = query.data?.stage;
  const otherSurface = sessionKind !== undefined && sessionKind !== kind;
  const incomplete = stage !== undefined && stage !== 'complete';

  useEffect(() => {
    if (unauthenticated) router.replace(loginPath(undefined, pathname));
    else if (stage !== undefined && stage !== 'complete')
      router.replace(secondFactorPath(stage, pathname));
    else if (sessionKind !== undefined && sessionKind !== kind)
      router.replace(homeFor(sessionKind));
  }, [unauthenticated, stage, sessionKind, kind, router, pathname]);

  const value = useMemo(
    () => (query.data === undefined ? null : { session: query.data, logout, endSession }),
    [query.data, logout, endSession],
  );

  if (query.error !== null && !unauthenticated) {
    const apiError = query.error instanceof ApiError ? query.error : undefined;
    return (
      <ErrorState
        message={apiError?.message ?? CLIENT_ERROR_MESSAGES.unexpected}
        correlationId={apiError?.correlationId}
        onRetry={() => void query.refetch()}
      />
    );
  }
  if (value === null || otherSurface || incomplete) {
    return <LoadingState label="Verificando su sesión" />;
  }
  return <SessionContext value={value}>{children}</SessionContext>;
}

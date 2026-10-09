'use client';

import { myPermissionsResponseSchema, type MyPermissionsResponse } from '@arza/contracts';
import { ErrorState, ForbiddenState, LoadingState } from '@arza/ui';
import { useQuery, type UseQueryResult } from '@tanstack/react-query';
import type { JSX, ReactNode } from 'react';

import { ApiError, CLIENT_ERROR_MESSAGES } from '../../lib/api/api-error';
import { useApiClient } from '../../lib/api/api-provider';

export const PERMISSIONS_QUERY_KEY = ['me', 'permissions'] as const;

/**
 * Permisos de la persona, solo para decidir qué mostrar (numeral 16.3): la API decide igual en
 * cada petición y es la única barrera de seguridad.
 */
export interface PermissionView {
  /** Ya llegaron los permisos. Mientras no, nada se muestra como permitido. */
  readonly ready: boolean;
  readonly granted: ReadonlySet<string>;
  readonly roles: MyPermissionsResponse['roles'];
  /** Tiene el permiso, al menos sobre lo propio. */
  readonly can: (code: string) => boolean;
  /** Tiene el permiso sobre todo, no solo sobre lo propio. */
  readonly canAll: (code: string) => boolean;
}

export function permissionViewOf(data: MyPermissionsResponse | undefined): PermissionView {
  const permissions = data?.permissions ?? [];
  const granted = new Set<string>(permissions.map((permission) => permission.code));
  const all = new Set<string>(
    permissions.filter((item) => item.scope === 'all').map((item) => item.code),
  );
  return {
    ready: data !== undefined,
    granted,
    roles: data?.roles ?? [],
    can: (code) => granted.has(code),
    canAll: (code) => all.has(code),
  };
}

export function useMyPermissionsQuery(): UseQueryResult<MyPermissionsResponse> {
  const api = useApiClient();
  return useQuery({
    queryKey: PERMISSIONS_QUERY_KEY,
    queryFn: ({ signal }) =>
      api.get('/v1/me/permissions', { schema: myPermissionsResponseSchema, signal }),
    staleTime: 60_000,
  });
}

export function usePermissions(): PermissionView {
  return permissionViewOf(useMyPermissionsQuery().data);
}

interface RequirePermissionProps {
  /** Basta con tener uno de estos permisos. */
  readonly anyOf: readonly string[];
  readonly children: ReactNode;
}

/**
 * Muestra la pantalla solo si la persona tiene el permiso; si no, «Sin permiso» sin revelar nada
 * (numeral 16.5). Si alguien escribe la dirección, la API le niega los datos igual.
 */
export function RequirePermission({ anyOf, children }: RequirePermissionProps): JSX.Element {
  const query = useMyPermissionsQuery();
  const view = permissionViewOf(query.data);
  if (query.error !== null) {
    const apiError = query.error instanceof ApiError ? query.error : undefined;
    return (
      <ErrorState
        message={apiError?.message ?? CLIENT_ERROR_MESSAGES.unexpected}
        correlationId={apiError?.correlationId}
        onRetry={() => void query.refetch()}
      />
    );
  }
  if (!view.ready) return <LoadingState label="Revisando sus permisos" />;
  if (!anyOf.some((code) => view.can(code))) return <ForbiddenState />;
  return <>{children}</>;
}

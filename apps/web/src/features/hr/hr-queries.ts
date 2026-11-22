'use client';

import { useQuery, type QueryKey, type UseQueryResult } from '@tanstack/react-query';
import type { z } from 'zod';

import { useApiClient } from '../../lib/api/api-provider';
import { useAdminAction, type AdminAction } from '../administration/admin-action';

export const HR_QUERY_ROOT = ['hr'] as const;

export function useHrQuery<T>(
  path: string,
  schema: z.ZodType<T>,
  enabled = true,
): UseQueryResult<T> {
  const api = useApiClient();
  return useQuery({
    queryKey: [...HR_QUERY_ROOT, path],
    queryFn: ({ signal }) => api.get(path, { schema, signal }),
    enabled,
  });
}

/** Con `refresh`, refresca también las consultas de otro módulo que usa estos formularios. */
export function useHrAction<T, R = unknown>(
  run: (input: T, csrfToken: string) => Promise<R>,
  onSuccess?: (result: R) => void,
  refresh: readonly QueryKey[] = [],
): AdminAction<T, R> {
  return useAdminAction({
    run,
    invalidate: [HR_QUERY_ROOT, ...refresh],
    reason: 'Los cambios quedan registrados en la auditoría.',
    ...(onSuccess === undefined ? {} : { onSuccess }),
  });
}

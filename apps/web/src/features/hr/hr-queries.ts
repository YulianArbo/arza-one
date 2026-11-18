'use client';

import { useQuery, type UseQueryResult } from '@tanstack/react-query';
import type { z } from 'zod';

import { useApiClient } from '../../lib/api/api-provider';
import { useAdminAction, type AdminAction } from '../administration/admin-action';

const HR_KEY = ['hr'] as const;

export function useHrQuery<T>(
  path: string,
  schema: z.ZodType<T>,
  enabled = true,
): UseQueryResult<T> {
  const api = useApiClient();
  return useQuery({
    queryKey: [...HR_KEY, path],
    queryFn: ({ signal }) => api.get(path, { schema, signal }),
    enabled,
  });
}

export function useHrAction<T, R = unknown>(
  run: (input: T, csrfToken: string) => Promise<R>,
  onSuccess?: (result: R) => void,
): AdminAction<T, R> {
  return useAdminAction({
    run,
    invalidate: [HR_KEY],
    reason: 'Los cambios quedan registrados en la auditoría.',
    ...(onSuccess === undefined ? {} : { onSuccess }),
  });
}

'use client';

import { useQuery, type UseQueryResult } from '@tanstack/react-query';
import type { z } from 'zod';

import { useApiClient } from '../../lib/api/api-provider';
import { useAdminAction, type AdminAction } from '../administration/admin-action';
import { HR_QUERY_ROOT } from '../hr/hr-queries';

// Consultas de Seguridad y salud en el trabajo (B37). Cada acción refresca también lo de Talento
// humano, porque un examen de ingreso o de egreso cierra una tarea de allá.

const SST_KEY = ['sst'] as const;

export function useSstQuery<T>(
  path: string,
  schema: z.ZodType<T>,
  enabled = true,
): UseQueryResult<T> {
  const api = useApiClient();
  return useQuery({
    queryKey: [...SST_KEY, path],
    queryFn: ({ signal }) => api.get(path, { schema, signal }),
    enabled,
  });
}

export function useSstAction<T, R = unknown>(
  run: (input: T, csrfToken: string) => Promise<R>,
  onSuccess?: (result: R) => void,
): AdminAction<T, R> {
  return useAdminAction({
    run,
    invalidate: [SST_KEY, HR_QUERY_ROOT],
    reason: 'Los cambios quedan registrados en la auditoría.',
    ...(onSuccess === undefined ? {} : { onSuccess }),
  });
}

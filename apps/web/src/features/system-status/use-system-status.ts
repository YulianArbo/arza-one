'use client';

import {
  healthResponseSchema,
  versionResponseSchema,
  type HealthResponse,
  type VersionResponse,
} from '@arza/contracts';
import { useQuery } from '@tanstack/react-query';

import { useApiClient } from '../../lib/api/api-provider';

// /health responde 503 con el mismo formato cuando alguna pieza no responde.
const HEALTH_STATUSES = [200, 503] as const;

export type SystemStatus =
  | { state: 'loading' }
  | { state: 'error'; error: unknown; retry: () => void }
  | { state: 'ready'; version: VersionResponse; health: HealthResponse; refresh: () => void };

/** Consulta /version y /health de la API y resume el resultado en un solo estado. */
export function useSystemStatus(): SystemStatus {
  const api = useApiClient();
  const version = useQuery({
    queryKey: ['platform', 'version'],
    queryFn: ({ signal }) => api.get('/version', { schema: versionResponseSchema, signal }),
  });
  const health = useQuery({
    queryKey: ['platform', 'health'],
    queryFn: ({ signal }) =>
      api.get('/health', {
        schema: healthResponseSchema,
        acceptedStatuses: HEALTH_STATUSES,
        signal,
      }),
  });
  const refetchAll = (): void => {
    void version.refetch();
    void health.refetch();
  };

  if (version.error ?? health.error) {
    return { state: 'error', error: version.error ?? health.error, retry: refetchAll };
  }
  if (version.data && health.data) {
    return { state: 'ready', version: version.data, health: health.data, refresh: refetchAll };
  }
  return { state: 'loading' };
}

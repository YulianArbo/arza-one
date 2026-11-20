'use client';

import { ToastProvider } from '@arza/ui';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createContext, use, useState, type JSX, type ReactNode } from 'react';

import { createApiClient, type ApiClient } from './api-client';
import { ApiError } from './api-error';

const ApiClientContext = createContext<ApiClient | null>(null);

const MAX_RETRIES = 1;

/** Reintenta una sola vez y solo si la falla es pasajera (sin conexión o error del servidor). */
export function shouldRetry(failureCount: number, error: unknown): boolean {
  return failureCount < MAX_RETRIES && error instanceof ApiError && error.isTransient;
}

function createQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: { retry: shouldRetry, refetchOnWindowFocus: false },
    },
  });
}

export interface ApiProviderProps {
  apiUrl: string;
  children: ReactNode;
}

/**
 * Entrega a las pantallas el cliente de la API, la caché de consultas (TanStack Query) y los
 * avisos breves de éxito (B22B).
 */
export function ApiProvider({ apiUrl, children }: ApiProviderProps): JSX.Element {
  const [queryClient] = useState(createQueryClient);
  const [apiClient] = useState(() => createApiClient(apiUrl));
  return (
    <ApiClientContext value={apiClient}>
      <QueryClientProvider client={queryClient}>
        <ToastProvider>{children}</ToastProvider>
      </QueryClientProvider>
    </ApiClientContext>
  );
}

export function useApiClient(): ApiClient {
  const client = use(ApiClientContext);
  if (!client) {
    throw new Error('useApiClient debe usarse dentro de ApiProvider');
  }
  return client;
}

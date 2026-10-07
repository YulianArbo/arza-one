'use client';

import { ErrorState, ForbiddenState, LoadingState } from '@arza/ui';
import type { JSX } from 'react';

import { ApiError, CLIENT_ERROR_MESSAGES } from '../../lib/api/api-error';
import { SystemStatusReport } from './system-status-report';
import { useSystemStatus } from './use-system-status';

/** Pantalla de ejemplo de B04: resuelve los estados de 16.5 con datos reales de la API. */
export function SystemStatusPanel(): JSX.Element {
  const status = useSystemStatus();
  switch (status.state) {
    case 'loading': {
      return <LoadingState label="Consultando el estado del sistema" />;
    }
    case 'error': {
      return <StatusError error={status.error} retry={status.retry} />;
    }
    case 'ready': {
      return (
        <SystemStatusReport
          version={status.version}
          health={status.health}
          onRefresh={status.refresh}
        />
      );
    }
  }
}

function StatusError({ error, retry }: { error: unknown; retry: () => void }): JSX.Element {
  if (error instanceof ApiError && error.isForbidden) {
    return <ForbiddenState />;
  }
  const apiError = error instanceof ApiError ? error : undefined;
  return (
    <ErrorState
      message={apiError?.message ?? CLIENT_ERROR_MESSAGES.unexpected}
      correlationId={apiError?.correlationId}
      onRetry={retry}
    />
  );
}

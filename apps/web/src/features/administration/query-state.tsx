'use client';

import { ErrorState, LoadingState } from '@arza/ui';
import type { UseQueryResult } from '@tanstack/react-query';
import type { JSX, ReactNode } from 'react';

import { ApiError, CLIENT_ERROR_MESSAGES } from '../../lib/api/api-error';

interface QueryStateProps<T> {
  readonly query: UseQueryResult<T>;
  readonly loadingLabel: string;
  readonly children: (data: T) => ReactNode;
}

/** Estados de pantalla de una consulta (numeral 16.5): cargando, error con reintento, datos. */
export function QueryState<T>({ query, loadingLabel, children }: QueryStateProps<T>): JSX.Element {
  if (query.isError) {
    const apiError = query.error instanceof ApiError ? query.error : undefined;
    return (
      <ErrorState
        message={apiError?.message ?? CLIENT_ERROR_MESSAGES.unexpected}
        correlationId={apiError?.correlationId}
        onRetry={() => void query.refetch()}
      />
    );
  }
  if (query.data === undefined) return <LoadingState label={loadingLabel} />;
  return <>{children(query.data)}</>;
}

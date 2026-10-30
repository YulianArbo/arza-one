'use client';

import {
  clauseListSchema,
  contractDetailSchema,
  contractListResponseSchema,
  contractOptionsSchema,
  type ClauseList,
  type ContractDetail,
  type ContractListResponse,
  type ContractOptions,
} from '@arza/contracts';
import { useQuery, type UseQueryResult } from '@tanstack/react-query';

import { useApiClient } from '../../lib/api/api-provider';
import type { AdminAction } from '../administration/admin-action';
import { useAdminAction } from '../administration/admin-action';
import { CRM_KEYS } from '../crm/queries';
import { queryString } from '../parties/queries';

// Consultas de Contratos (B24). La API revisa el permiso, «lo propio» y el aislamiento en cada una.

export const CONTRACT_KEYS = {
  all: ['contracts'] as const,
  list: (search: string) => ['contracts', 'list', search] as const,
  detail: (id: string) => ['contracts', 'detail', id] as const,
  options: (search: string) => ['contracts', 'options', search] as const,
  clauses: ['contracts', 'clauses'] as const,
};

type Filters = Readonly<Record<string, string | null | undefined>>;

function withQuery(path: string, filters: Filters): string {
  const search = queryString(filters);
  return search === '' ? path : `${path}?${search}`;
}

export function useContracts(filters: Filters): UseQueryResult<ContractListResponse> {
  const api = useApiClient();
  const path = withQuery('/v1/contracts', filters);
  return useQuery({
    queryKey: CONTRACT_KEYS.list(path),
    queryFn: ({ signal }) => api.get(path, { schema: contractListResponseSchema, signal }),
  });
}

export function useContract(id: string): UseQueryResult<ContractDetail> {
  const api = useApiClient();
  return useQuery({
    queryKey: CONTRACT_KEYS.detail(id),
    queryFn: ({ signal }) =>
      api.get(`/v1/contracts/${id}`, { schema: contractDetailSchema, signal }),
  });
}

/** Plantillas, firmantes del cliente elegido y la cotización aceptada de origen. */
export function useContractOptions(filters: Filters): UseQueryResult<ContractOptions> {
  const api = useApiClient();
  const path = withQuery('/v1/contracts/options', filters);
  return useQuery({
    queryKey: CONTRACT_KEYS.options(path),
    queryFn: ({ signal }) => api.get(path, { schema: contractOptionsSchema, signal }),
  });
}

export function useClauses(): UseQueryResult<ClauseList> {
  const api = useApiClient();
  return useQuery({
    queryKey: CONTRACT_KEYS.clauses,
    queryFn: ({ signal }) => api.get('/v1/contract-clauses', { schema: clauseListSchema, signal }),
  });
}

/** Toda acción de Contratos recarga lo de Contratos y del CRM (la cotización cambia de uso). */
export function useContractAction<TArgs, TResult = void>(
  run: (args: TArgs, csrfToken: string) => Promise<TResult>,
  onSuccess?: (result: TResult, args: TArgs) => void,
): AdminAction<TArgs, TResult> {
  return useAdminAction<TArgs, TResult>({
    run,
    invalidate: [CONTRACT_KEYS.all, CRM_KEYS.all],
    reason: 'Los cambios de los contratos quedan en la auditoría.',
    ...(onSuccess === undefined ? {} : { onSuccess }),
  });
}

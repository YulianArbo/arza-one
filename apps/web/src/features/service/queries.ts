'use client';

import {
  compensationListResponseSchema,
  slaPolicyListResponseSchema,
  ticketDetailSchema,
  ticketListResponseSchema,
  ticketMessageListResponseSchema,
  ticketOptionsSchema,
  warrantyListResponseSchema,
  type CompensationListResponse,
  type SlaPolicyListResponse,
  type TicketDetail,
  type TicketListResponse,
  type TicketMessage,
  type TicketOptions,
  type WarrantyListResponse,
} from '@arza/contracts';
import { useQuery, type UseQueryResult } from '@tanstack/react-query';
import type { z } from 'zod';

import { useApiClient } from '../../lib/api/api-provider';
import { useAdminAction, type AdminAction } from '../administration/admin-action';
import { queryString } from '../parties/queries';

// Consultas de la mesa de ayuda (B28). La API revisa el permiso, lo que cada quien puede ver y el
// aislamiento en cada una. La bandeja se vuelve a pedir cada minuto para que el reloj esté al día.

const SERVICE_KEY = ['service'] as const;
const INBOX_REFRESH_MS = 60_000;

function useServiceQuery<T>(
  path: string,
  schema: z.ZodType<T>,
  options: { readonly enabled?: boolean; readonly refetchInterval?: number } = {},
): UseQueryResult<T> {
  const api = useApiClient();
  return useQuery({
    queryKey: [...SERVICE_KEY, path],
    queryFn: ({ signal }) => api.get(path, { schema, signal }),
    ...options,
  });
}

export function useTickets(
  filters: Readonly<Record<string, string | null | undefined>>,
): UseQueryResult<TicketListResponse> {
  const search = queryString(filters);
  const path = search === '' ? '/v1/tickets' : `/v1/tickets?${search}`;
  return useServiceQuery(path, ticketListResponseSchema, { refetchInterval: INBOX_REFRESH_MS });
}

export function useTicket(id: string): UseQueryResult<TicketDetail> {
  return useServiceQuery(`/v1/tickets/${id}`, ticketDetailSchema, {
    refetchInterval: INBOX_REFRESH_MS,
  });
}

export function useTicketMessages(id: string): UseQueryResult<{ data: TicketMessage[] }> {
  return useServiceQuery(`/v1/tickets/${id}/messages`, ticketMessageListResponseSchema);
}

export function useCompensations(
  id: string,
  enabled: boolean,
): UseQueryResult<CompensationListResponse> {
  return useServiceQuery(`/v1/tickets/${id}/compensations`, compensationListResponseSchema, {
    enabled,
  });
}

/** A quién se puede asignar (solo quien asigna). */
export function useTicketOptions(enabled: boolean): UseQueryResult<TicketOptions> {
  return useServiceQuery('/v1/tickets/options', ticketOptionsSchema, { enabled });
}

export function useSlaPolicies(): UseQueryResult<SlaPolicyListResponse> {
  return useServiceQuery('/v1/sla-policies', slaPolicyListResponseSchema);
}

export function useWarranties(active: string): UseQueryResult<WarrantyListResponse> {
  const path = active === '' ? '/v1/warranties' : `/v1/warranties?active=${active}`;
  return useServiceQuery(path, warrantyListResponseSchema);
}

/** Toda acción de la mesa de ayuda recarga lo de la mesa de ayuda: la bandeja y la ficha. */
export function useServiceAction<TArgs, TResult = void>(
  run: (args: TArgs, csrfToken: string) => Promise<TResult>,
  onSuccess?: (result: TResult, args: TArgs) => void,
): AdminAction<TArgs, TResult> {
  return useAdminAction<TArgs, TResult>({
    run,
    invalidate: [SERVICE_KEY],
    reason: 'Los cambios de los tiquetes quedan en la auditoría.',
    ...(onSuccess === undefined ? {} : { onSuccess }),
  });
}

'use client';

import {
  acknowledgementReportSchema,
  acknowledgementRequestResponseSchema,
  changeRequestListResponseSchema,
  changeRequestSchema,
  createdResponseSchema,
  masterListResponseSchema,
  type AcknowledgementReport,
  type AcknowledgementRequestResponse,
  type ChangeRequest,
  type ChangeRequestAction,
  type ChangeRequestListResponse,
  type ChangeRequestStep,
  type CreateChangeRequest,
  type MasterListQuery,
  type MasterListResponse,
} from '@arza/contracts';
import { useQuery, type UseQueryResult } from '@tanstack/react-query';

import { useApiClient } from '../../lib/api/api-provider';
import { useAdminAction, type AdminAction } from '../administration/admin-action';
import { queryString } from '../parties/queries';

// Consultas y acciones del control documental del SGC (B19): Solicitud de Acción Documental,
// Listado Maestro y constancia de lectura. La API revisa el permiso y el aislamiento en cada una.

const SGC_KEYS = {
  requests: (filters: string) => ['documents', 'change-requests', filters] as const,
  request: (id: string) => ['documents', 'change-requests', id] as const,
  masterList: (filters: string) => ['documents', 'master-list', filters] as const,
  reading: (id: string) => ['documents', id, 'reading'] as const,
};

const REASON = 'Los cambios de los documentos quedan en la auditoría.';

export interface RequestFilters {
  readonly status?: string;
  readonly usable?: ChangeRequestAction;
  readonly documentId?: string;
}

export function useChangeRequests(
  filters: RequestFilters,
): UseQueryResult<ChangeRequestListResponse> {
  const api = useApiClient();
  const query = queryString({
    status: filters.status,
    usable: filters.usable,
    document_id: filters.documentId,
  });
  return useQuery({
    queryKey: SGC_KEYS.requests(query),
    queryFn: ({ signal }) =>
      api.get(`/v1/change-requests?${query}`, { schema: changeRequestListResponseSchema, signal }),
  });
}

export function useChangeRequest(id: string): UseQueryResult<ChangeRequest> {
  const api = useApiClient();
  return useQuery({
    queryKey: SGC_KEYS.request(id),
    queryFn: ({ signal }) =>
      api.get(`/v1/change-requests/${id}`, { schema: changeRequestSchema, signal }),
  });
}

export function useCreateChangeRequest(
  onSaved: (id: string) => void,
): AdminAction<CreateChangeRequest, { id: string }> {
  const api = useApiClient();
  return useAdminAction<CreateChangeRequest, { id: string }>({
    run: (body, csrfToken) =>
      api.post('/v1/change-requests', { body, schema: createdResponseSchema, csrfToken }),
    invalidate: [['documents']],
    onSuccess: (result) => {
      onSaved(result.id);
    },
    reason: REASON,
  });
}

export interface RequestStep {
  readonly id: string;
  readonly version: number;
  readonly step: ChangeRequestStep;
  readonly comment: string | null;
}

export function useRequestStep(onDone?: () => void): AdminAction<RequestStep, unknown> {
  const api = useApiClient();
  return useAdminAction<RequestStep, unknown>({
    run: ({ id, version, step, comment }, csrfToken) =>
      api.post(`/v1/change-requests/${id}/actions/${step}`, {
        body: { comment },
        version,
        csrfToken,
      }),
    invalidate: [['documents']],
    ...(onDone === undefined ? {} : { onSuccess: onDone }),
    reason: REASON,
  });
}

/** Filtros del listado como los pide la API (sin los vacíos). */
export function masterListFilters(filters: Partial<MasterListQuery>): Record<string, string> {
  return Object.fromEntries(
    Object.entries(filters).filter((entry): entry is [string, string] => {
      const value = entry[1];
      return typeof value === 'string' && value.trim() !== '';
    }),
  );
}

export function useMasterList(
  filters: Partial<MasterListQuery>,
): UseQueryResult<MasterListResponse> {
  const api = useApiClient();
  const query = queryString(masterListFilters(filters));
  return useQuery({
    queryKey: SGC_KEYS.masterList(query),
    queryFn: ({ signal }) =>
      api.get(`/v1/master-list?${query}`, { schema: masterListResponseSchema, signal }),
  });
}

export function useReading(documentId: string): UseQueryResult<AcknowledgementReport> {
  const api = useApiClient();
  return useQuery({
    queryKey: SGC_KEYS.reading(documentId),
    queryFn: ({ signal }) =>
      api.get(`/v1/documents/${documentId}/acknowledgements`, {
        schema: acknowledgementReportSchema,
        signal,
      }),
  });
}

export function useConfirmReading(documentId: string): AdminAction<undefined, unknown> {
  const api = useApiClient();
  return useAdminAction<undefined, unknown>({
    run: (_args, csrfToken) =>
      api.post(`/v1/documents/${documentId}/acknowledgements/mine`, { body: {}, csrfToken }),
    invalidate: [SGC_KEYS.reading(documentId)],
    reason: REASON,
  });
}

export function useRequestReading(
  documentId: string,
): AdminAction<undefined, AcknowledgementRequestResponse> {
  const api = useApiClient();
  return useAdminAction<undefined, AcknowledgementRequestResponse>({
    run: (_args, csrfToken) =>
      api.post(`/v1/documents/${documentId}/acknowledgement-requests`, {
        body: {},
        schema: acknowledgementRequestResponseSchema,
        csrfToken,
      }),
    invalidate: [SGC_KEYS.reading(documentId)],
    reason: REASON,
  });
}

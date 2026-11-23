'use client';

import {
  cookieConsentListResponseSchema,
  cookieReportSchema,
  createdResponseSchema,
  erasureResultSchema,
  portalPrivacyRequestListSchema,
  privacyIncidentListResponseSchema,
  privacyIncidentSchema,
  privacyRequestListResponseSchema,
  privacyRequestReceiptSchema,
  privacyRequestSchema,
  type CookieConsentListResponse,
  type CookieReport,
  type CreatePrivacyIncident,
  type CreatePrivacyRequest,
  type ErasureResult,
  type PortalPrivacyRequest,
  type PortalPrivacyRequestList,
  type PrivacyIncident,
  type PrivacyIncidentListResponse,
  type PrivacyRequest,
  type PrivacyRequestListResponse,
  type PrivacyRequestReceipt,
} from '@arza/contracts';
import { useQuery, type UseQueryResult } from '@tanstack/react-query';

import type { DownloadedFile } from '../../lib/api/api-client';
import { useApiClient } from '../../lib/api/api-provider';
import { useAdminAction, type AdminAction } from '../administration/admin-action';
import { save } from '../audit/audit-export-button';
import { queryString } from '../parties/queries';

// Consultas y acciones de las solicitudes de titulares, la entrega y supresión de datos, los
// incidentes y las cookies (B42). La API revisa el permiso y el aislamiento en cada una.

const KEYS = {
  requests: ['privacy', 'requests'] as const,
  request: (id: string) => ['privacy', 'requests', id] as const,
  incidents: ['privacy', 'incidents'] as const,
  incident: (id: string) => ['privacy', 'incidents', id] as const,
  cookies: (from: string, to: string) => ['privacy', 'cookies', from, to] as const,
  mine: ['portal', 'privacy-requests'] as const,
};

const REASON = 'Los cambios de privacidad quedan en la auditoría.';

export function usePrivacyRequests(
  status: string,
  cursor: string | null,
): UseQueryResult<PrivacyRequestListResponse> {
  const api = useApiClient();
  const query = queryString({ status, cursor });
  return useQuery({
    queryKey: [...KEYS.requests, status, cursor],
    queryFn: ({ signal }) =>
      api.get(`/v1/privacy-requests?${query}`, {
        schema: privacyRequestListResponseSchema,
        signal,
      }),
  });
}

export function usePrivacyRequest(id: string): UseQueryResult<PrivacyRequest> {
  const api = useApiClient();
  return useQuery({
    queryKey: KEYS.request(id),
    queryFn: ({ signal }) =>
      api.get(`/v1/privacy-requests/${id}`, { schema: privacyRequestSchema, signal }),
    // Mientras una entrega se prepara, la ficha se refresca sola.
    refetchInterval: (query) =>
      query.state.data?.exports.some((item) => item.status === 'pending') === true ? 5000 : false,
  });
}

export function useCreatePrivacyRequest(
  onCreated: (id: string) => void,
): AdminAction<CreatePrivacyRequest, { id: string }> {
  const api = useApiClient();
  return useAdminAction<CreatePrivacyRequest, { id: string }>({
    run: (body, csrfToken) =>
      api.post('/v1/privacy-requests', { body, schema: createdResponseSchema, csrfToken }),
    invalidate: [KEYS.requests],
    onSuccess: (created) => {
      onCreated(created.id);
    },
    reason: REASON,
  });
}

/** Un paso de la solicitud con la versión que se vio. */
export function useRequestStep(
  request: PrivacyRequest,
  action: string,
  onDone?: () => void,
): AdminAction<object, unknown> {
  const api = useApiClient();
  return useAdminAction<object, unknown>({
    run: async (body, csrfToken) => {
      await api.post(`/v1/privacy-requests/${request.id}/actions/${action}`, {
        body,
        version: request.version,
        csrfToken,
      });
    },
    invalidate: [KEYS.requests],
    ...(onDone === undefined ? {} : { onSuccess: onDone }),
    reason: REASON,
  });
}

export function useExportPersonalData(request: PrivacyRequest): AdminAction<null, unknown> {
  const api = useApiClient();
  return useAdminAction<null, unknown>({
    run: (_none, csrfToken) =>
      api.post(`/v1/parties/${request.party?.id ?? ''}/personal-data/export`, {
        body: { request_id: request.id },
        schema: createdResponseSchema,
        csrfToken,
      }),
    invalidate: [KEYS.requests],
    reason: REASON,
  });
}

export function useErasePersonalData(
  request: PrivacyRequest,
  onDone: () => void,
): AdminAction<null, ErasureResult> {
  const api = useApiClient();
  return useAdminAction<null, ErasureResult>({
    run: (_none, csrfToken) =>
      api.post(`/v1/parties/${request.party?.id ?? ''}/personal-data/erase`, {
        body: { request_id: request.id },
        schema: erasureResultSchema,
        csrfToken,
      }),
    invalidate: [KEYS.requests],
    onSuccess: onDone,
    reason: REASON,
  });
}

/** El PDF de una entrega lista, con la sesión. */
export function useExportPdf(): (requestId: string, exportId: string) => Promise<DownloadedFile> {
  const api = useApiClient();
  return async (requestId, exportId) => ({
    fileName: `datos-${requestId.slice(0, 8)}.pdf`,
    content: await api.image(`/v1/privacy-requests/${requestId}/exports/${exportId}/pdf`),
  });
}

/** Descarga un registro en CSV (solicitudes o incidentes); queda en la auditoría. */
export function useRegisterDownload(path: string): AdminAction<null, DownloadedFile> {
  const api = useApiClient();
  return useAdminAction<null, DownloadedFile>({
    run: (_none, csrfToken) => api.download(path, { body: {}, csrfToken }),
    invalidate: [],
    onSuccess: save,
    successMessage: null,
    reason: REASON,
  });
}

export function usePrivacyIncidents(status: string): UseQueryResult<PrivacyIncidentListResponse> {
  const api = useApiClient();
  return useQuery({
    queryKey: [...KEYS.incidents, status],
    queryFn: ({ signal }) =>
      api.get(`/v1/privacy-incidents?${queryString({ status })}`, {
        schema: privacyIncidentListResponseSchema,
        signal,
      }),
  });
}

export function usePrivacyIncident(id: string): UseQueryResult<PrivacyIncident> {
  const api = useApiClient();
  return useQuery({
    queryKey: KEYS.incident(id),
    queryFn: ({ signal }) =>
      api.get(`/v1/privacy-incidents/${id}`, { schema: privacyIncidentSchema, signal }),
  });
}

export function useCreateIncident(
  onCreated: (id: string) => void,
): AdminAction<CreatePrivacyIncident, { id: string }> {
  const api = useApiClient();
  return useAdminAction<CreatePrivacyIncident, { id: string }>({
    run: (body, csrfToken) =>
      api.post('/v1/privacy-incidents', { body, schema: createdResponseSchema, csrfToken }),
    invalidate: [KEYS.incidents],
    onSuccess: (created) => {
      onCreated(created.id);
    },
    reason: REASON,
  });
}

/** Un paso del incidente con la versión que se vio; `path` va después de su identificador. */
export function useIncidentStep(
  incident: PrivacyIncident,
  path: string,
  onDone?: () => void,
): AdminAction<object, unknown> {
  const api = useApiClient();
  return useAdminAction<object, unknown>({
    run: async (body, csrfToken) => {
      await api.post(`/v1/privacy-incidents/${incident.id}/${path}`, {
        body,
        version: incident.version,
        csrfToken,
      });
    },
    invalidate: [KEYS.incidents],
    ...(onDone === undefined ? {} : { onSuccess: onDone }),
    reason: REASON,
  });
}

export function useCookieConsents(
  from: string,
  to: string,
): { list: UseQueryResult<CookieConsentListResponse>; report: UseQueryResult<CookieReport> } {
  const api = useApiClient();
  const query = queryString({ from, to });
  const enabled = from !== '' && to !== '' && from <= to;
  const list = useQuery({
    queryKey: [...KEYS.cookies(from, to), 'list'],
    queryFn: ({ signal }) =>
      api.get(`/v1/privacy/cookie-consents?${query}`, {
        schema: cookieConsentListResponseSchema,
        signal,
      }),
    enabled,
  });
  const report = useQuery({
    queryKey: [...KEYS.cookies(from, to), 'report'],
    queryFn: ({ signal }) =>
      api.get(`/v1/privacy/cookie-consents/report?${query}`, {
        schema: cookieReportSchema,
        signal,
      }),
    enabled,
  });
  return { list, report };
}

export function useMyPrivacyRequests(): UseQueryResult<PortalPrivacyRequestList> {
  const api = useApiClient();
  return useQuery({
    queryKey: KEYS.mine,
    queryFn: ({ signal }) =>
      api.get('/v1/portal/me/privacy-requests', { schema: portalPrivacyRequestListSchema, signal }),
  });
}

export function useFileMyPrivacyRequest(
  onFiled: (receipt: PrivacyRequestReceipt) => void,
): AdminAction<PortalPrivacyRequest, PrivacyRequestReceipt> {
  const api = useApiClient();
  return useAdminAction<PortalPrivacyRequest, PrivacyRequestReceipt>({
    run: (body, csrfToken) =>
      api.post('/v1/portal/me/privacy-requests', {
        body,
        schema: privacyRequestReceiptSchema,
        csrfToken,
      }),
    invalidate: [KEYS.mine],
    onSuccess: onFiled,
    reason: REASON,
  });
}

'use client';

import {
  activityListResponseSchema,
  activitySchema,
  processorSchema,
  consentListResponseSchema,
  createdResponseSchema,
  noticeListResponseSchema,
  noticeSchema,
  processorListResponseSchema,
  consentSchema,
  type ActivityListResponse,
  type ConsentListResponse,
  type ConsentStatus,
  type CreateActivityRequest,
  type CreateNoticeRequest,
  type CreateProcessorRequest,
  type NoticeListResponse,
  type ProcessorListResponse,
  type UpdateActivityRequest,
  type UpdateNoticeRequest,
  type UpdateProcessorRequest,
} from '@arza/contracts';
import { useQuery, type UseQueryResult } from '@tanstack/react-query';
import type { z } from 'zod';

import { useApiClient } from '../../lib/api/api-provider';
import { useAdminAction, type AdminAction } from '../administration/admin-action';
import { PARTY_KEYS, queryString } from '../parties/queries';

// Consultas y acciones de privacidad (B17). La API revisa el permiso y el aislamiento en cada una.

export const PRIVACY_KEYS = {
  all: ['privacy'] as const,
  notices: ['privacy', 'notices'] as const,
  consents: (status: string, cursor: string | null) =>
    ['privacy', 'consents', status, cursor] as const,
  activities: ['privacy', 'activities'] as const,
  processors: ['privacy', 'processors'] as const,
};

const REASON = 'Los cambios de privacidad quedan en la auditoría.';

export function useNotices(): UseQueryResult<NoticeListResponse> {
  const api = useApiClient();
  return useQuery({
    queryKey: PRIVACY_KEYS.notices,
    queryFn: ({ signal }) => api.get('/v1/notices', { schema: noticeListResponseSchema, signal }),
  });
}

export function useConsents(
  status: ConsentStatus | '',
  cursor: string | null,
): UseQueryResult<ConsentListResponse> {
  const api = useApiClient();
  const query = queryString({ status, cursor });
  return useQuery({
    queryKey: PRIVACY_KEYS.consents(status, cursor),
    queryFn: ({ signal }) =>
      api.get(`/v1/consents?${query}`, { schema: consentListResponseSchema, signal }),
  });
}

export function useActivities(): UseQueryResult<ActivityListResponse> {
  const api = useApiClient();
  return useQuery({
    queryKey: PRIVACY_KEYS.activities,
    queryFn: ({ signal }) =>
      api.get('/v1/processing-activities', { schema: activityListResponseSchema, signal }),
  });
}

export function useProcessors(enabled = true): UseQueryResult<ProcessorListResponse> {
  const api = useApiClient();
  return useQuery({
    queryKey: PRIVACY_KEYS.processors,
    queryFn: ({ signal }) =>
      api.get('/v1/processors', { schema: processorListResponseSchema, signal }),
    enabled,
  });
}

type NoticeSave =
  | { readonly id: null; readonly body: CreateNoticeRequest }
  | { readonly id: string; readonly version: number; readonly body: UpdateNoticeRequest };

export function useSaveNotice(onSaved: () => void): AdminAction<NoticeSave, unknown> {
  const api = useApiClient();
  return useAdminAction<NoticeSave, unknown>({
    run: (save, csrfToken) =>
      save.id === null
        ? api.post('/v1/notices', { body: save.body, schema: createdResponseSchema, csrfToken })
        : api.patch(`/v1/notices/${save.id}`, {
            body: save.body,
            version: save.version,
            schema: noticeSchema,
            csrfToken,
          }),
    invalidate: [PRIVACY_KEYS.notices],
    onSuccess: onSaved,
    reason: REASON,
  });
}

export function usePublishNotice(): AdminAction<{ id: string; version: number }, unknown> {
  const api = useApiClient();
  return useAdminAction<{ id: string; version: number }, unknown>({
    run: ({ id, version }, csrfToken) =>
      api.post(`/v1/notices/${id}/actions/publish`, {
        body: {},
        version,
        schema: noticeSchema,
        csrfToken,
      }),
    invalidate: [PRIVACY_KEYS.notices],
    reason: REASON,
  });
}

export function useRevokeConsent(
  onDone: () => void,
): AdminAction<{ id: string; reason: string }, unknown> {
  const api = useApiClient();
  return useAdminAction<{ id: string; reason: string }, unknown>({
    run: ({ id, reason }, csrfToken) =>
      api.post(`/v1/consents/${id}/actions/revoke`, {
        body: { reason },
        schema: consentSchema,
        csrfToken,
      }),
    invalidate: [PRIVACY_KEYS.all, PARTY_KEYS.all],
    onSuccess: onDone,
    reason: REASON,
  });
}

type RecordSave<TCreate, TUpdate> =
  | { readonly id: null; readonly body: TCreate }
  | { readonly id: string; readonly version: number; readonly body: TUpdate };

interface RecordTarget {
  readonly path: string;
  readonly key: readonly string[];
  /** Lo que responde la API al editar. */
  readonly schema: z.ZodType;
}

function useRecordSave<TCreate extends object, TUpdate extends object>(
  { path, key, schema }: RecordTarget,
  onSaved: () => void,
): AdminAction<RecordSave<TCreate, TUpdate>, unknown> {
  const api = useApiClient();
  return useAdminAction<RecordSave<TCreate, TUpdate>, unknown>({
    run: (save, csrfToken) =>
      save.id === null
        ? api.post(path, { body: save.body, schema: createdResponseSchema, csrfToken })
        : api.patch(`${path}/${save.id}`, {
            body: save.body,
            version: save.version,
            schema,
            csrfToken,
          }),
    invalidate: [key],
    onSuccess: onSaved,
    reason: REASON,
  });
}

export function useSaveActivity(
  onSaved: () => void,
): AdminAction<RecordSave<CreateActivityRequest, UpdateActivityRequest>, unknown> {
  return useRecordSave<CreateActivityRequest, UpdateActivityRequest>(
    { path: '/v1/processing-activities', key: PRIVACY_KEYS.activities, schema: activitySchema },
    onSaved,
  );
}

export function useSaveProcessor(
  onSaved: () => void,
): AdminAction<RecordSave<CreateProcessorRequest, UpdateProcessorRequest>, unknown> {
  return useRecordSave<CreateProcessorRequest, UpdateProcessorRequest>(
    { path: '/v1/processors', key: PRIVACY_KEYS.processors, schema: processorSchema },
    onSaved,
  );
}

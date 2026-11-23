'use client';

import {
  legalTextListResponseSchema,
  pageListResponseSchema,
  siteCreatedResponseSchema,
  submissionListResponseSchema,
  unsubscribeListResponseSchema,
  type ApproveLegalText,
  type CreateLegalText,
  type SavePage,
  type LegalTextListResponse,
  type PageListResponse,
  type SubmissionListResponse,
  type UnsubscribeListResponse,
  type UpdateLegalText,
} from '@arza/contracts';
import { useQuery, type UseQueryResult } from '@tanstack/react-query';

import { useApiClient } from '../../lib/api/api-provider';
import { useAdminAction, type AdminAction } from '../administration/admin-action';

// Consultas y acciones del sitio web (B41). La API revisa el permiso y el aislamiento en cada una.

const WEBSITE_KEYS = {
  pages: ['website', 'pages'] as const,
  texts: ['website', 'texts'] as const,
  submissions: ['website', 'submissions'] as const,
  unsubscribes: ['website', 'unsubscribes'] as const,
};

const REASON = 'Los cambios del sitio web quedan en la auditoría.';

export function usePages(): UseQueryResult<PageListResponse> {
  const api = useApiClient();
  return useQuery({
    queryKey: WEBSITE_KEYS.pages,
    queryFn: ({ signal }) => api.get('/v1/site/pages', { schema: pageListResponseSchema, signal }),
  });
}

export function useLegalTexts(): UseQueryResult<LegalTextListResponse> {
  const api = useApiClient();
  return useQuery({
    queryKey: WEBSITE_KEYS.texts,
    queryFn: ({ signal }) =>
      api.get('/v1/site/legal-texts', { schema: legalTextListResponseSchema, signal }),
  });
}

export function useSubmissions(): UseQueryResult<SubmissionListResponse> {
  const api = useApiClient();
  return useQuery({
    queryKey: WEBSITE_KEYS.submissions,
    queryFn: ({ signal }) =>
      api.get('/v1/site/submissions', { schema: submissionListResponseSchema, signal }),
  });
}

export function useUnsubscribes(): UseQueryResult<UnsubscribeListResponse> {
  const api = useApiClient();
  return useQuery({
    queryKey: WEBSITE_KEYS.unsubscribes,
    queryFn: ({ signal }) =>
      api.get('/v1/site/unsubscribes', { schema: unsubscribeListResponseSchema, signal }),
  });
}

export type PageSave =
  | { readonly id: null; readonly body: SavePage }
  | { readonly id: string; readonly version: number; readonly body: SavePage };

export function useSavePage(onSaved: () => void): AdminAction<PageSave, unknown> {
  const api = useApiClient();
  return useAdminAction<PageSave, unknown>({
    run: (save, csrfToken) =>
      save.id === null
        ? api.post('/v1/site/pages', {
            body: save.body,
            schema: siteCreatedResponseSchema,
            csrfToken,
          })
        : api.patch(`/v1/site/pages/${save.id}`, {
            body: save.body,
            version: save.version,
            csrfToken,
          }),
    invalidate: [WEBSITE_KEYS.pages],
    onSuccess: onSaved,
    reason: REASON,
  });
}

export interface PageStep {
  readonly id: string;
  readonly version: number;
  readonly action: 'publish' | 'withdraw';
}

export function usePageStep(): AdminAction<PageStep, unknown> {
  const api = useApiClient();
  return useAdminAction<PageStep, unknown>({
    run: ({ id, version, action }, csrfToken) =>
      api.post(`/v1/site/pages/${id}/actions`, { body: { action }, version, csrfToken }),
    invalidate: [WEBSITE_KEYS.pages],
    reason: REASON,
  });
}

export type TextSave =
  | { readonly id: null; readonly body: CreateLegalText }
  | { readonly id: string; readonly version: number; readonly body: UpdateLegalText };

export function useSaveText(onSaved: () => void): AdminAction<TextSave, unknown> {
  const api = useApiClient();
  return useAdminAction<TextSave, unknown>({
    run: (save, csrfToken) =>
      save.id === null
        ? api.post('/v1/site/legal-texts', {
            body: save.body,
            schema: siteCreatedResponseSchema,
            csrfToken,
          })
        : api.patch(`/v1/site/legal-texts/${save.id}`, {
            body: save.body,
            version: save.version,
            csrfToken,
          }),
    invalidate: [WEBSITE_KEYS.texts],
    onSuccess: onSaved,
    reason: REASON,
  });
}

export interface TextStep {
  readonly id: string;
  readonly version: number;
  readonly step: 'approve' | 'publish';
}

export function useTextStep(): AdminAction<TextStep, unknown> {
  const api = useApiClient();
  return useAdminAction<TextStep, unknown>({
    run: ({ id, version, step }, csrfToken) => {
      const body: ApproveLegalText | object = step === 'approve' ? { concept_file_id: null } : {};
      return api.post(`/v1/site/legal-texts/${id}/actions/${step}`, { body, version, csrfToken });
    },
    invalidate: [WEBSITE_KEYS.texts],
    reason: REASON,
  });
}

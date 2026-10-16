'use client';

import {
  notificationListResponseSchema,
  notificationPreferencesSchema,
  notificationTemplateListSchema,
  type NotificationKind,
  type NotificationListResponse,
  type NotificationPreferences,
  type NotificationTemplate,
  type UpdateNotificationPreferencesRequest,
  type UpdateNotificationTemplateRequest,
} from '@arza/contracts';
import { useQuery, type UseQueryResult } from '@tanstack/react-query';

import { useApiClient } from '../../lib/api/api-provider';
import { useAdminAction, type AdminAction } from '../administration/admin-action';

// Consultas y acciones de los avisos (B16). La API decide qué avisos ve cada persona y cuándo:
// un aviso diferido fuera de jornada no llega a la web antes del inicio de la siguiente.

export const NTF_KEYS = {
  all: ['ntf'] as const,
  list: (unread: boolean, limit: number) => ['ntf', 'notifications', unread, limit] as const,
  preferences: ['ntf', 'preferences'] as const,
  templates: ['ntf', 'templates'] as const,
};

/** Cada minuto la campanita vuelve a preguntar si hay avisos nuevos. */
const REFRESH_MS = 60_000;
const REASON = 'Esta acción cambia sus avisos.';

export function useNotifications(
  unread: boolean,
  limit = 30,
): UseQueryResult<NotificationListResponse> {
  const api = useApiClient();
  const query = new URLSearchParams({ limit: String(limit) });
  if (unread) query.set('unread', 'true');
  return useQuery({
    queryKey: NTF_KEYS.list(unread, limit),
    queryFn: ({ signal }) =>
      api.get(`/v1/me/notifications?${query.toString()}`, {
        schema: notificationListResponseSchema,
        signal,
      }),
    refetchInterval: REFRESH_MS,
  });
}

export function useMarkRead(): AdminAction<string, void> {
  const api = useApiClient();
  return useAdminAction<string>({
    run: (id, csrfToken) => api.post(`/v1/me/notifications/${id}/read`, { body: {}, csrfToken }),
    invalidate: [NTF_KEYS.all],
    reason: REASON,
  });
}

export function useMarkAllRead(): AdminAction<null, void> {
  const api = useApiClient();
  return useAdminAction<null>({
    run: (_args, csrfToken) => api.post('/v1/me/notifications/read-all', { body: {}, csrfToken }),
    invalidate: [NTF_KEYS.all],
    reason: REASON,
  });
}

export function usePreferences(): UseQueryResult<NotificationPreferences> {
  const api = useApiClient();
  return useQuery({
    queryKey: NTF_KEYS.preferences,
    queryFn: ({ signal }) =>
      api.get('/v1/me/notification-preferences', { schema: notificationPreferencesSchema, signal }),
  });
}

export function useSavePreferences(): AdminAction<UpdateNotificationPreferencesRequest, unknown> {
  const api = useApiClient();
  return useAdminAction<UpdateNotificationPreferencesRequest, unknown>({
    run: (body, csrfToken) =>
      api.put('/v1/me/notification-preferences', {
        body,
        csrfToken,
        schema: notificationPreferencesSchema,
      }),
    invalidate: [NTF_KEYS.preferences],
    reason: REASON,
  });
}

export function useTemplates(): UseQueryResult<{ readonly items: NotificationTemplate[] }> {
  const api = useApiClient();
  return useQuery({
    queryKey: NTF_KEYS.templates,
    queryFn: ({ signal }) =>
      api.get('/v1/notification-templates', { schema: notificationTemplateListSchema, signal }),
  });
}

export interface TemplateEdit {
  readonly kind: NotificationKind;
  readonly version: number;
  readonly body: UpdateNotificationTemplateRequest;
}

export function useSaveTemplate(onSaved: () => void): AdminAction<TemplateEdit, void> {
  const api = useApiClient();
  return useAdminAction<TemplateEdit>({
    run: ({ kind, version, body }, csrfToken) =>
      api.patch(`/v1/notification-templates/${kind}`, { body, version, csrfToken }),
    invalidate: [NTF_KEYS.templates],
    onSuccess: onSaved,
    reason: 'Esta acción cambia los avisos que reciben todas las personas de la empresa.',
  });
}

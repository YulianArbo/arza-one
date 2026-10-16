'use client';

import {
  attachmentListSchema,
  commentListSchema,
  createdResponseSchema,
  downloadLinkResponseSchema,
  type AttachmentList,
  type CommentList,
  type CreateAttachmentRequest,
  type CreateCommentRequest,
  type DownloadLinkResponse,
  type RecordRef,
} from '@arza/contracts';
import { useQuery, type UseQueryResult } from '@tanstack/react-query';

import { useApiClient } from '../../lib/api/api-provider';
import { useAdminAction, type AdminAction } from '../administration/admin-action';
import { useSession } from '../session/session-provider';

// Comentarios y adjuntos de cualquier registro (B16). El módulo dueño del registro decide en la
// API quién los ve y quién escribe; la web solo muestra lo que la API entrega.

export const RECORD_KEYS = {
  comments: (ref: RecordRef) => ['records', 'comments', ref.entity_type, ref.entity_id] as const,
  attachments: (ref: RecordRef) =>
    ['records', 'attachments', ref.entity_type, ref.entity_id] as const,
};

const REASON = 'Esta acción cambia los comentarios o adjuntos de un registro.';

function recordQuery(ref: RecordRef): string {
  return new URLSearchParams({ entity_type: ref.entity_type, entity_id: ref.entity_id }).toString();
}

export function useComments(ref: RecordRef): UseQueryResult<CommentList> {
  const api = useApiClient();
  return useQuery({
    queryKey: RECORD_KEYS.comments(ref),
    queryFn: ({ signal }) =>
      api.get(`/v1/comments?${recordQuery(ref)}`, { schema: commentListSchema, signal }),
  });
}

export function useAddComment(
  ref: RecordRef,
  onDone: () => void,
): AdminAction<CreateCommentRequest, unknown> {
  const api = useApiClient();
  return useAdminAction<CreateCommentRequest, unknown>({
    run: (body, csrfToken) =>
      api.post('/v1/comments', { body, csrfToken, schema: createdResponseSchema }),
    invalidate: [RECORD_KEYS.comments(ref)],
    onSuccess: onDone,
    reason: REASON,
  });
}

export function useRemoveComment(ref: RecordRef): AdminAction<string, void> {
  const api = useApiClient();
  return useAdminAction<string>({
    run: (id, csrfToken) => api.delete(`/v1/comments/${id}`, { csrfToken }),
    invalidate: [RECORD_KEYS.comments(ref)],
    reason: REASON,
  });
}

export function useAttachments(ref: RecordRef): UseQueryResult<AttachmentList> {
  const api = useApiClient();
  return useQuery({
    queryKey: RECORD_KEYS.attachments(ref),
    queryFn: ({ signal }) =>
      api.get(`/v1/attachments?${recordQuery(ref)}`, { schema: attachmentListSchema, signal }),
  });
}

export function useAddAttachment(
  ref: RecordRef,
  onDone: () => void,
): AdminAction<CreateAttachmentRequest, unknown> {
  const api = useApiClient();
  return useAdminAction<CreateAttachmentRequest, unknown>({
    run: (body, csrfToken) =>
      api.post('/v1/attachments', { body, csrfToken, schema: createdResponseSchema }),
    invalidate: [RECORD_KEYS.attachments(ref)],
    onSuccess: onDone,
    reason: REASON,
  });
}

export function useRemoveAttachment(ref: RecordRef): AdminAction<string, void> {
  const api = useApiClient();
  return useAdminAction<string>({
    run: (id, csrfToken) => api.delete(`/v1/attachments/${id}`, { csrfToken }),
    invalidate: [RECORD_KEYS.attachments(ref)],
    reason: REASON,
  });
}

/** Pide el enlace de descarga de cinco minutos de un adjunto. */
export function useAttachmentLink(): (id: string) => Promise<DownloadLinkResponse> {
  const api = useApiClient();
  const { session } = useSession();
  return (id) =>
    api.post(`/v1/attachments/${id}/download-link`, {
      body: {},
      csrfToken: session.csrf_token,
      schema: downloadLinkResponseSchema,
    });
}

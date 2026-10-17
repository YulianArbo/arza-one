'use client';

import {
  createdResponseSchema,
  documentLinkListResponseSchema,
  documentListResponseSchema,
  documentSchema,
  downloadLinkResponseSchema,
  fileSchema,
  folderListResponseSchema,
  uploadLinkResponseSchema,
  versionListResponseSchema,
  type CreateDocumentLinkRequest,
  type CreateDocumentRequest,
  type CreateFolderRequest,
  type CreateVersionRequest,
  type Document,
  type DocumentLinkListResponse,
  type DocumentListResponse,
  type DownloadLinkResponse,
  type FileView,
  type FolderListResponse,
  type VersionListResponse,
} from '@arza/contracts';
import {
  useMutation,
  useQuery,
  type UseMutationResult,
  type UseQueryResult,
} from '@tanstack/react-query';

import { useApiClient } from '../../lib/api/api-provider';
import { useAdminAction, type AdminAction } from '../administration/admin-action';
import { queryString } from '../parties/queries';
import { useSession } from '../session/session-provider';

// Consultas y acciones de documentos, versiones y expedientes (B18). La API revisa el permiso y el
// aislamiento en cada una.

export const DOC_KEYS = {
  all: ['documents'] as const,
  folders: ['documents', 'folders'] as const,
  list: (folderId: string | null, q: string, cursor: string | null) =>
    ['documents', 'list', folderId, q, cursor] as const,
  detail: (id: string) => ['documents', id] as const,
  versions: (id: string) => ['documents', id, 'versions'] as const,
  links: (id: string) => ['documents', id, 'links'] as const,
};

const REASON = 'Los cambios de los documentos quedan en la auditoría.';
/** Cada cuánto se revisa mientras un archivo está en análisis o una versión se convierte. */
const POLL_MS = 2000;

export function useFolders(): UseQueryResult<FolderListResponse> {
  const api = useApiClient();
  return useQuery({
    queryKey: DOC_KEYS.folders,
    queryFn: ({ signal }) => api.get('/v1/folders', { schema: folderListResponseSchema, signal }),
  });
}

export function useDocuments(
  folderId: string | null,
  q: string,
  cursor: string | null,
): UseQueryResult<DocumentListResponse> {
  const api = useApiClient();
  const query = queryString({ folder_id: folderId, q: q.length >= 2 ? q : '', cursor });
  return useQuery({
    queryKey: DOC_KEYS.list(folderId, q, cursor),
    queryFn: ({ signal }) =>
      api.get(`/v1/documents?${query}`, { schema: documentListResponseSchema, signal }),
  });
}

export function useDocument(id: string): UseQueryResult<Document> {
  const api = useApiClient();
  return useQuery({
    queryKey: DOC_KEYS.detail(id),
    queryFn: ({ signal }) => api.get(`/v1/documents/${id}`, { schema: documentSchema, signal }),
  });
}

/** Versiones; se revisan solas mientras alguna se convierte a PDF. */
export function useVersions(id: string): UseQueryResult<VersionListResponse> {
  const api = useApiClient();
  return useQuery({
    queryKey: DOC_KEYS.versions(id),
    queryFn: ({ signal }) =>
      api.get(`/v1/documents/${id}/versions`, { schema: versionListResponseSchema, signal }),
    refetchInterval: (query) =>
      query.state.data?.data.some((v) => v.render_status === 'pending') === true ? POLL_MS : false,
  });
}

export function useDocumentLinks(id: string): UseQueryResult<DocumentLinkListResponse> {
  const api = useApiClient();
  return useQuery({
    queryKey: DOC_KEYS.links(id),
    queryFn: ({ signal }) =>
      api.get(`/v1/documents/${id}/links`, { schema: documentLinkListResponseSchema, signal }),
  });
}

/** Estado del archivo fuente recién subido, hasta que el antivirus termine. */
export function useSourceFile(id: string | null): UseQueryResult<FileView> {
  const api = useApiClient();
  return useQuery({
    queryKey: ['files', id],
    queryFn: ({ signal }) => api.get(`/v1/files/${id ?? ''}`, { schema: fileSchema, signal }),
    enabled: id !== null,
    refetchInterval: (query) => {
      const status = query.state.data?.status;
      return status === 'scanning' || status === 'pending_upload' ? POLL_MS : false;
    },
  });
}

/** Pide el enlace de subida y envía el archivo; devuelve su identificador. */
export function useUploadSource(): UseMutationResult<string, unknown, File> {
  const api = useApiClient();
  const { session } = useSession();
  return useMutation({
    mutationFn: async (file: File) => {
      const link = await api.post('/v1/files', {
        body: { file_name: file.name, mime_type: file.type, size_bytes: file.size },
        schema: uploadLinkResponseSchema,
        csrfToken: session.csrf_token,
      });
      await api.putFile(link.upload_url, file);
      return link.id;
    },
  });
}

/** Enlace de cinco minutos del PDF o del fuente de una versión; la API verifica la huella. */
export function useVersionLink(): (
  versionId: string,
  file: 'pdf' | 'source',
) => Promise<DownloadLinkResponse> {
  const api = useApiClient();
  const { session } = useSession();
  return (versionId, file) =>
    api.post(`/v1/versions/${versionId}/download-link`, {
      body: { file },
      schema: downloadLinkResponseSchema,
      csrfToken: session.csrf_token,
    });
}

export function useCreateFolder(
  onSaved: (id: string) => void,
): AdminAction<CreateFolderRequest, { id: string }> {
  const api = useApiClient();
  return useAdminAction<CreateFolderRequest, { id: string }>({
    run: (body, csrfToken) =>
      api.post('/v1/folders', { body, schema: createdResponseSchema, csrfToken }),
    invalidate: [DOC_KEYS.folders],
    onSuccess: (result) => {
      onSaved(result.id);
    },
    reason: REASON,
  });
}

export function useCreateDocument(
  onSaved: (id: string) => void,
): AdminAction<CreateDocumentRequest, { id: string }> {
  const api = useApiClient();
  return useAdminAction<CreateDocumentRequest, { id: string }>({
    run: (body, csrfToken) =>
      api.post('/v1/documents', { body, schema: createdResponseSchema, csrfToken }),
    invalidate: [DOC_KEYS.all],
    onSuccess: (result) => {
      onSaved(result.id);
    },
    reason: REASON,
  });
}

type VersionSave =
  | { readonly versionId: null; readonly body: CreateVersionRequest }
  | { readonly versionId: string; readonly version: number; readonly body: CreateVersionRequest };

export function useSaveVersion(
  documentId: string,
  onSaved: () => void,
): AdminAction<VersionSave, unknown> {
  const api = useApiClient();
  return useAdminAction<VersionSave, unknown>({
    run: (save, csrfToken) =>
      save.versionId === null
        ? api.post(`/v1/documents/${documentId}/versions`, {
            body: save.body,
            schema: createdResponseSchema,
            csrfToken,
          })
        : api.patch(`/v1/versions/${save.versionId}`, {
            body: save.body,
            version: save.version,
            csrfToken,
          }),
    invalidate: [DOC_KEYS.all],
    onSuccess: onSaved,
    reason: REASON,
  });
}

export interface StepRequest {
  readonly versionId: string;
  readonly version: number;
  readonly step: 'submit' | 'reject' | 'approve' | 'publish' | 'obsolete';
  readonly body: object;
}

export function useVersionStep(onDone: () => void): AdminAction<StepRequest, unknown> {
  const api = useApiClient();
  return useAdminAction<StepRequest, unknown>({
    run: ({ versionId, version, step, body }, csrfToken) =>
      api.post(`/v1/versions/${versionId}/actions/${step}`, { body, version, csrfToken }),
    invalidate: [DOC_KEYS.all],
    onSuccess: onDone,
    reason: REASON,
  });
}

export function useCreateLink(
  documentId: string,
  onSaved: () => void,
): AdminAction<CreateDocumentLinkRequest, unknown> {
  const api = useApiClient();
  return useAdminAction<CreateDocumentLinkRequest, unknown>({
    run: (body, csrfToken) =>
      api.post(`/v1/documents/${documentId}/links`, {
        body,
        schema: createdResponseSchema,
        csrfToken,
      }),
    invalidate: [DOC_KEYS.links(documentId)],
    onSuccess: onSaved,
    reason: REASON,
  });
}

export function useRemoveLink(documentId: string): AdminAction<string, unknown> {
  const api = useApiClient();
  return useAdminAction<string, unknown>({
    run: (linkId, csrfToken) =>
      api.delete(`/v1/documents/${documentId}/links/${linkId}`, { csrfToken }),
    invalidate: [DOC_KEYS.links(documentId)],
    reason: REASON,
  });
}

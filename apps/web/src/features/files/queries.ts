'use client';

import {
  downloadLinkResponseSchema,
  fileListResponseSchema,
  uploadLinkResponseSchema,
  type DownloadLinkResponse,
  type FileListResponse,
} from '@arza/contracts';
import {
  useMutation,
  useQuery,
  useQueryClient,
  type UseMutationResult,
  type UseQueryResult,
} from '@tanstack/react-query';

import { useApiClient } from '../../lib/api/api-provider';
import { useSession } from '../session/session-provider';
import { inProgress } from './labels';

// Consultas de archivos (B14). La API revisa el permiso y el aislamiento en cada una.

const FILES_KEY = ['files'] as const;
/** Cada cuánto se revisa el estado mientras algún archivo está en análisis. */
const POLL_MS = 2000;

export function useFiles(): UseQueryResult<FileListResponse> {
  const api = useApiClient();
  return useQuery({
    queryKey: FILES_KEY,
    queryFn: ({ signal }) => api.get('/v1/files', { schema: fileListResponseSchema, signal }),
    refetchInterval: (query) => (query.state.data?.data.some(inProgress) ? POLL_MS : false),
  });
}

/** Pide el enlace de subida y envía el archivo por él; el análisis sigue en el worker. */
export function useUploadFile(): UseMutationResult<void, unknown, File> {
  const api = useApiClient();
  const { session } = useSession();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (file: File) => {
      const link = await api.post('/v1/files', {
        body: { file_name: file.name, mime_type: file.type, size_bytes: file.size },
        schema: uploadLinkResponseSchema,
        csrfToken: session.csrf_token,
      });
      await api.putFile(link.upload_url, file);
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: FILES_KEY }),
  });
}

/** Enlace de descarga de cinco minutos; pedirlo queda en la auditoría. */
export function useDownloadLink(): (fileId: string) => Promise<DownloadLinkResponse> {
  const api = useApiClient();
  const { session } = useSession();
  return (fileId) =>
    api.post(`/v1/files/${fileId}/download-link`, {
      body: {},
      schema: downloadLinkResponseSchema,
      csrfToken: session.csrf_token,
    });
}

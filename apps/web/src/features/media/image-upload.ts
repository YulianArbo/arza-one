'use client';

import {
  IMAGE_ERROR_CODES,
  IMAGE_TYPES,
  MAX_IMAGE_BYTES,
  uploadLinkResponseSchema,
} from '@arza/contracts';
import {
  useMutation,
  useQueryClient,
  type QueryClient,
  type QueryKey,
  type UseMutationResult,
} from '@tanstack/react-query';

import { ApiError } from '../../lib/api/api-error';
import { useApiClient } from '../../lib/api/api-provider';
import { useSession } from '../session/session-provider';
import { MEDIA_KEYS } from './media-queries';

// Subir una foto o un logo (B22A): pedir el enlace, enviar la imagen y usarla. El antivirus tarda
// unos segundos; mientras revisa, la API responde «todavía en revisión» y la web vuelve a intentar.

const WAIT_MS = 1500;
const ATTEMPTS = 20;

/** Problema de la imagen elegida, antes de enviarla; null si sirve. */
export function imageProblem(file: File): string | null {
  if (!IMAGE_TYPES.includes(file.type)) return 'Use una imagen PNG o JPG.';
  if (file.size > MAX_IMAGE_BYTES) return 'La imagen debe pesar hasta 2 MB.';
  return null;
}

export interface ImageTarget {
  /** Ruta que entrega el enlace de subida. */
  readonly uploads: string;
  /** Ruta que usa la imagen (PUT), la quita (DELETE) y la muestra (GET). */
  readonly image: string;
  /** Consultas que cambian con la imagen, como el perfil o la ficha del tercero. */
  readonly refresh: readonly QueryKey[];
}

/** Vuelve a pedir la imagen desde cero (sin mostrar la anterior) y lo que depende de ella. */
async function refreshAfter(client: QueryClient, target: ImageTarget): Promise<void> {
  await client.resetQueries({ queryKey: MEDIA_KEYS.image(target.image) });
  await Promise.all(target.refresh.map((queryKey) => client.invalidateQueries({ queryKey })));
}

function isScanning(error: unknown): boolean {
  return error instanceof ApiError && error.code === IMAGE_ERROR_CODES.scanning;
}

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

export function useImageUpload(target: ImageTarget): UseMutationResult<void, Error, File> {
  const api = useApiClient();
  const { session } = useSession();
  const client = useQueryClient();
  const csrfToken = session.csrf_token;
  return useMutation({
    mutationFn: async (file: File) => {
      const body = { file_name: file.name, mime_type: file.type, size_bytes: file.size };
      const link = await api.post(target.uploads, {
        body,
        schema: uploadLinkResponseSchema,
        csrfToken,
      });
      await api.putFile(link.upload_url, file);
      for (let attempt = 1; ; attempt += 1) {
        try {
          await api.put(target.image, { body: { file_id: link.id }, csrfToken });
          return;
        } catch (error) {
          if (!isScanning(error) || attempt === ATTEMPTS) throw error;
          await wait(WAIT_MS);
        }
      }
    },
    onSuccess: () => refreshAfter(client, target),
  });
}

export function useImageRemoval(target: ImageTarget): UseMutationResult<void, Error, void> {
  const api = useApiClient();
  const { session } = useSession();
  const client = useQueryClient();
  return useMutation({
    mutationFn: () => api.delete(target.image, { csrfToken: session.csrf_token }),
    onSuccess: () => refreshAfter(client, target),
  });
}

'use client';

import {
  IMAGE_ERROR_CODES,
  announcementSchema,
  createdResponseSchema,
  uploadLinkResponseSchema,
  type Announcement,
  type AnnouncementRequest,
} from '@arza/contracts';
import { useMutation, type UseMutationResult } from '@tanstack/react-query';

import { ApiError } from '../../lib/api/api-error';
import { useApiClient } from '../../lib/api/api-provider';
import { useAdminAction, type AdminAction } from '../administration/admin-action';
import { useSession } from '../session/session-provider';
import { ANNOUNCEMENTS_PATH, ANNOUNCEMENT_KEYS } from './announcement-queries';

// Guardar un comunicado (B36A). La imagen se sube primero y el antivirus tarda unos segundos:
// mientras la revisa, la API responde «todavía en revisión» y la web vuelve a intentar.

const WAIT_MS = 1500;
const ATTEMPTS = 20;

function isScanning(error: unknown): boolean {
  return error instanceof ApiError && error.code === IMAGE_ERROR_CODES.scanning;
}

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

async function whileScanning<T>(send: () => Promise<T>): Promise<T> {
  for (let attempt = 1; ; attempt += 1) {
    try {
      return await send();
    } catch (error) {
      if (!isScanning(error) || attempt === ATTEMPTS) throw error;
      await wait(WAIT_MS);
    }
  }
}

/** Crea el comunicado o guarda la edición con la versión que se vio. */
export function useSaveAnnouncement(
  announcement: Announcement | null,
  onSaved: () => void,
): AdminAction<AnnouncementRequest, unknown> {
  const api = useApiClient();
  return useAdminAction<AnnouncementRequest, unknown>({
    run: (body, csrfToken) =>
      whileScanning(() =>
        announcement === null
          ? api.post(ANNOUNCEMENTS_PATH, { body, schema: createdResponseSchema, csrfToken })
          : api.patch(`${ANNOUNCEMENTS_PATH}/${announcement.id}`, {
              body,
              version: announcement.version,
              schema: announcementSchema,
              csrfToken,
            }),
      ),
    invalidate: [ANNOUNCEMENT_KEYS.list],
    successMessage: 'El comunicado quedó guardado.',
    reason: 'Los comunicados se publican en la pantalla de acceso.',
    onSuccess: onSaved,
  });
}

/** Sube la imagen elegida y devuelve su identificador; el antivirus sigue revisándola. */
export function useAnnouncementImage(): UseMutationResult<string, Error, File> {
  const api = useApiClient();
  const { session } = useSession();
  return useMutation({
    mutationFn: async (file: File) => {
      const body = { file_name: file.name, mime_type: file.type, size_bytes: file.size };
      const link = await api.post(`${ANNOUNCEMENTS_PATH}/uploads`, {
        body,
        schema: uploadLinkResponseSchema,
        csrfToken: session.csrf_token,
      });
      await api.putFile(link.upload_url, file);
      return link.id;
    },
  });
}

/** Terminar un comunicado antes de su fecha de fin. */
export function useEndAnnouncement(): AdminAction<Announcement, unknown> {
  const api = useApiClient();
  return useAdminAction<Announcement, unknown>({
    run: (announcement, csrfToken) =>
      api.post(`${ANNOUNCEMENTS_PATH}/${announcement.id}/end`, {
        body: {},
        version: announcement.version,
        csrfToken,
      }),
    invalidate: [ANNOUNCEMENT_KEYS.list],
    successMessage: 'El comunicado quedó terminado.',
    reason: 'Los comunicados se publican en la pantalla de acceso.',
  });
}

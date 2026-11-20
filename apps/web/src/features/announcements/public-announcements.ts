'use client';

import {
  publicAnnouncementListResponseSchema,
  type PublicAnnouncementListResponse,
} from '@arza/contracts';
import { useQuery, type UseQueryResult } from '@tanstack/react-query';

import { useApiClient } from '../../lib/api/api-provider';

// Comunicados vigentes para la pantalla de acceso (B36A), sin sesión.

export type AccessTab = 'staff' | 'clients';

export function publicImagePath(id: string): string {
  return `/v1/public/announcements/${id}/image`;
}

export function usePublicAnnouncements(
  tab: AccessTab,
): UseQueryResult<PublicAnnouncementListResponse> {
  const api = useApiClient();
  return useQuery({
    queryKey: ['announcements', 'public', tab],
    queryFn: ({ signal }) =>
      api.get(`/v1/public/announcements?audience=${tab}`, {
        schema: publicAnnouncementListResponseSchema,
        signal,
      }),
    // Si falla, el acceso sigue funcionando: solo no muestra comunicados.
    retry: false,
    staleTime: 60_000,
  });
}

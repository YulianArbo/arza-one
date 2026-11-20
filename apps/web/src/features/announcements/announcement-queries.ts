'use client';

import { announcementListResponseSchema, type AnnouncementListResponse } from '@arza/contracts';
import { useQuery, type UseQueryResult } from '@tanstack/react-query';

import { useApiClient } from '../../lib/api/api-provider';

// Consultas de los comunicados (B36A): la lista de Administración.

export const ANNOUNCEMENT_KEYS = { list: ['announcements'] as const };

export const ANNOUNCEMENTS_PATH = '/v1/announcements';

export function useAnnouncements(): UseQueryResult<AnnouncementListResponse> {
  const api = useApiClient();
  return useQuery({
    queryKey: ANNOUNCEMENT_KEYS.list,
    queryFn: ({ signal }) =>
      api.get(ANNOUNCEMENTS_PATH, { schema: announcementListResponseSchema, signal }),
  });
}

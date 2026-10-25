'use client';

import {
  meResponseSchema,
  myCompanyResponseSchema,
  type MeResponse,
  type MyCompanyResponse,
} from '@arza/contracts';
import { useQuery, type UseQueryResult } from '@tanstack/react-query';
import { useEffect, useMemo } from 'react';

import { useApiClient } from '../../lib/api/api-provider';

// Fotos de perfil y logos (B22A): la API los entrega con la sesión y la web los muestra como una
// dirección local del navegador (blob:), la única que permite la política de contenido.

export const MEDIA_KEYS = {
  me: ['me'] as const,
  company: ['me', 'company'] as const,
  images: ['images'] as const,
  image: (path: string) => ['images', path] as const,
};

export const MY_PHOTO_PATH = '/v1/me/photo';
export const MY_COMPANY_LOGO_PATH = '/v1/me/company/logo';

export function partyLogoPath(partyId: string): string {
  return `/v1/parties/${partyId}/logo`;
}

export function useMe(): UseQueryResult<MeResponse> {
  const api = useApiClient();
  return useQuery({
    queryKey: MEDIA_KEYS.me,
    queryFn: ({ signal }) => api.get('/v1/me', { schema: meResponseSchema, signal }),
  });
}

export function useMyCompany(): UseQueryResult<MyCompanyResponse> {
  const api = useApiClient();
  return useQuery({
    queryKey: MEDIA_KEYS.company,
    queryFn: ({ signal }) => api.get('/v1/me/company', { schema: myCompanyResponseSchema, signal }),
  });
}

/** Dirección para mostrar la imagen; null mientras no hay imagen o no ha llegado. */
export function useImageUrl(path: string | null): string | null {
  const api = useApiClient();
  const { data } = useQuery({
    queryKey: MEDIA_KEYS.image(path ?? ''),
    queryFn: ({ signal }) => api.image(path ?? '', signal),
    enabled: path !== null,
    retry: false,
  });
  const url = useMemo(() => (data === undefined ? null : URL.createObjectURL(data)), [data]);
  useEffect(
    () => () => {
      if (url !== null) URL.revokeObjectURL(url);
    },
    [url],
  );
  return path === null ? null : url;
}

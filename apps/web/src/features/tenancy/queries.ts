'use client';

import {
  platformTenantListResponseSchema,
  tenantBrandingSchema,
  tenantExportListResponseSchema,
  type PlatformTenantListResponse,
  type TenantBranding,
  type TenantExportListResponse,
} from '@arza/contracts';
import { useQuery, type UseQueryResult } from '@tanstack/react-query';

import { useApiClient } from '../../lib/api/api-provider';
import { BRANDING_PATH } from './labels';

// Consultas de multiempresa (B48). La API revisa el permiso en cada una.

export const TENANCY_KEYS = {
  branding: ['tenancy', 'branding'] as const,
  tenants: ['tenancy', 'tenants'] as const,
  exports: ['tenancy', 'exports'] as const,
};

/** Marca de la empresa de la persona: la ve toda la empresa. */
export function useBranding(): UseQueryResult<TenantBranding> {
  const api = useApiClient();
  return useQuery({
    queryKey: TENANCY_KEYS.branding,
    queryFn: ({ signal }) => api.get(BRANDING_PATH, { schema: tenantBrandingSchema, signal }),
    staleTime: 5 * 60 * 1000,
  });
}

export function usePlatformTenants(): UseQueryResult<PlatformTenantListResponse> {
  const api = useApiClient();
  return useQuery({
    queryKey: TENANCY_KEYS.tenants,
    queryFn: ({ signal }) =>
      api.get('/v1/platform/tenants', { schema: platformTenantListResponseSchema, signal }),
  });
}

/** Exportaciones de la empresa; mientras alguna se genera, se consulta cada 15 segundos. */
export function useTenantExports(): UseQueryResult<TenantExportListResponse> {
  const api = useApiClient();
  return useQuery({
    queryKey: TENANCY_KEYS.exports,
    queryFn: ({ signal }) =>
      api.get('/v1/tenant/exports', { schema: tenantExportListResponseSchema, signal }),
    refetchInterval: (query) =>
      query.state.data?.data.some(
        (entry) => entry.status === 'queued' || entry.status === 'running',
      )
        ? 15_000
        : false,
  });
}

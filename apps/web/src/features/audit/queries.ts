'use client';

import {
  auditEventListResponseSchema,
  auditExportListResponseSchema,
  securityEventListResponseSchema,
  type AuditEventListResponse,
  type AuditExportListResponse,
  type SecurityEventListResponse,
} from '@arza/contracts';
import { useQuery, type UseQueryResult } from '@tanstack/react-query';

import { useApiClient } from '../../lib/api/api-provider';

// Consultas de la auditoría (B11). La API revisa el permiso en cada una y deja la consulta
// registrada en la propia auditoría.

export const AUDIT_KEYS = {
  events: ['audit', 'events'] as const,
  history: (type: string, id: string) => ['audit', 'history', type, id] as const,
  security: ['audit', 'security'] as const,
  exports: ['audit', 'exports'] as const,
};

/** Filtros de la pantalla; los vacíos no se envían. */
export type AuditFilters = Readonly<Record<string, string>>;

function pathWith(base: string, filters: AuditFilters, cursor: string | null): string {
  const params = new URLSearchParams({ limit: '25' });
  for (const [key, value] of Object.entries(filters)) {
    if (value.trim() !== '') params.set(key, value.trim());
  }
  if (cursor !== null) params.set('cursor', cursor);
  return `${base}?${params.toString()}`;
}

export function useAuditEvents(
  filters: AuditFilters,
  cursor: string | null,
): UseQueryResult<AuditEventListResponse> {
  const api = useApiClient();
  return useQuery({
    queryKey: [...AUDIT_KEYS.events, filters, cursor],
    queryFn: ({ signal }) =>
      api.get(pathWith('/v1/audit-events', filters, cursor), {
        schema: auditEventListResponseSchema,
        signal,
      }),
  });
}

export function useEntityHistory(
  entity: { readonly type: string; readonly id: string },
  cursor: string | null,
): UseQueryResult<AuditEventListResponse> {
  const api = useApiClient();
  const base = `/v1/entities/${entity.type}/${entity.id}/history`;
  return useQuery({
    queryKey: [...AUDIT_KEYS.history(entity.type, entity.id), cursor],
    queryFn: ({ signal }) =>
      api.get(pathWith(base, {}, cursor), { schema: auditEventListResponseSchema, signal }),
  });
}

export function useSecurityEvents(
  filters: AuditFilters,
  cursor: string | null,
): UseQueryResult<SecurityEventListResponse> {
  const api = useApiClient();
  return useQuery({
    queryKey: [...AUDIT_KEYS.security, filters, cursor],
    queryFn: ({ signal }) =>
      api.get(pathWith('/v1/security-events', filters, cursor), {
        schema: securityEventListResponseSchema,
        signal,
      }),
  });
}

export function useAuditExports(cursor: string | null): UseQueryResult<AuditExportListResponse> {
  const api = useApiClient();
  return useQuery({
    queryKey: [...AUDIT_KEYS.exports, cursor],
    queryFn: ({ signal }) =>
      api.get(pathWith('/v1/audit-exports', {}, cursor), {
        schema: auditExportListResponseSchema,
        signal,
      }),
  });
}

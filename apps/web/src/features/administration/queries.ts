'use client';

import {
  accessReviewResponseSchema,
  delegationListResponseSchema,
  permissionCatalogResponseSchema,
  roleDetailResponseSchema,
  roleListResponseSchema,
  userDetailResponseSchema,
  userListResponseSchema,
  type AccessReviewResponse,
  type DelegationListResponse,
  type PermissionCatalogResponse,
  type RoleDetailResponse,
  type RoleListResponse,
  type UserDetailResponse,
  type UserListResponse,
} from '@arza/contracts';
import { useQuery, type UseQueryResult } from '@tanstack/react-query';

import { useApiClient } from '../../lib/api/api-provider';

// Consultas de la administración de usuarios y roles (B10). La API revisa el permiso en cada una.

export const ADMIN_KEYS = {
  users: ['admin', 'users'] as const,
  user: (id: string) => ['admin', 'users', id] as const,
  roles: ['admin', 'roles'] as const,
  role: (id: string) => ['admin', 'roles', id] as const,
  catalog: ['admin', 'permissions'] as const,
  delegations: ['admin', 'delegations'] as const,
  accessReview: ['admin', 'access-review'] as const,
};

export interface UserFilters {
  readonly q: string;
  readonly status: string;
}

function usersPath(filters: UserFilters, cursor: string | null): string {
  const params = new URLSearchParams({ limit: '25' });
  if (filters.q.trim() !== '') params.set('q', filters.q.trim());
  if (filters.status !== '') params.set('status', filters.status);
  if (cursor !== null) params.set('cursor', cursor);
  return `/v1/users?${params.toString()}`;
}

export function useUserPage(
  filters: UserFilters,
  cursor: string | null,
): UseQueryResult<UserListResponse> {
  const api = useApiClient();
  return useQuery({
    queryKey: [...ADMIN_KEYS.users, filters, cursor],
    queryFn: ({ signal }) =>
      api.get(usersPath(filters, cursor), { schema: userListResponseSchema, signal }),
  });
}

export function useUser(id: string): UseQueryResult<UserDetailResponse> {
  const api = useApiClient();
  return useQuery({
    queryKey: ADMIN_KEYS.user(id),
    queryFn: ({ signal }) =>
      api.get(`/v1/users/${id}`, { schema: userDetailResponseSchema, signal }),
  });
}

export function useRoles(enabled = true): UseQueryResult<RoleListResponse> {
  const api = useApiClient();
  return useQuery({
    queryKey: ADMIN_KEYS.roles,
    queryFn: ({ signal }) => api.get('/v1/roles', { schema: roleListResponseSchema, signal }),
    enabled,
  });
}

export function useRole(id: string): UseQueryResult<RoleDetailResponse> {
  const api = useApiClient();
  return useQuery({
    queryKey: ADMIN_KEYS.role(id),
    queryFn: ({ signal }) =>
      api.get(`/v1/roles/${id}`, { schema: roleDetailResponseSchema, signal }),
  });
}

export function usePermissionCatalog(): UseQueryResult<PermissionCatalogResponse> {
  const api = useApiClient();
  return useQuery({
    queryKey: ADMIN_KEYS.catalog,
    queryFn: ({ signal }) =>
      api.get('/v1/permissions', { schema: permissionCatalogResponseSchema, signal }),
    staleTime: Number.POSITIVE_INFINITY,
  });
}

export function useDelegations(): UseQueryResult<DelegationListResponse> {
  const api = useApiClient();
  return useQuery({
    queryKey: ADMIN_KEYS.delegations,
    queryFn: ({ signal }) =>
      api.get('/v1/delegations', { schema: delegationListResponseSchema, signal }),
  });
}

export function useAccessReview(): UseQueryResult<AccessReviewResponse> {
  const api = useApiClient();
  return useQuery({
    queryKey: ADMIN_KEYS.accessReview,
    queryFn: ({ signal }) =>
      api.get('/v1/access-review', { schema: accessReviewResponseSchema, signal }),
  });
}

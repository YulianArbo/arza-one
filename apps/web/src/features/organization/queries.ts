'use client';

import {
  catalogDetailResponseSchema,
  catalogListResponseSchema,
  costCenterListResponseSchema,
  holidayListResponseSchema,
  orgUnitListResponseSchema,
  parameterHistoryResponseSchema,
  parameterListResponseSchema,
  positionListResponseSchema,
  sequenceListResponseSchema,
  siteListResponseSchema,
  tenantProfileSchema,
  type CatalogDetailResponse,
  type CatalogListResponse,
  type CostCenterListResponse,
  type HolidayListResponse,
  type OrgUnitListResponse,
  type ParameterHistoryResponse,
  type ParameterListResponse,
  type PositionListResponse,
  type SequenceListResponse,
  type SiteListResponse,
  type TenantProfile,
} from '@arza/contracts';
import { useQuery, type UseQueryResult } from '@tanstack/react-query';
import type { z } from 'zod';

import { useApiClient } from '../../lib/api/api-provider';

// Consultas de los datos maestros de la empresa (B12). La API revisa el permiso en cada una.

export const CORE_KEYS = {
  tenant: ['core', 'tenant'] as const,
  sites: ['core', 'sites'] as const,
  units: ['core', 'org-units'] as const,
  positions: ['core', 'positions'] as const,
  costCenters: ['core', 'cost-centers'] as const,
  catalogs: ['core', 'catalogs'] as const,
  catalog: (key: string) => ['core', 'catalogs', key] as const,
  parameters: ['core', 'parameters'] as const,
  parameterHistory: (key: string) => ['core', 'parameters', key] as const,
  sequences: ['core', 'sequences'] as const,
  holidays: (year: number) => ['core', 'holidays', year] as const,
};

function useCoreQuery<T>(
  key: readonly unknown[],
  path: string,
  schema: z.ZodType<T>,
): UseQueryResult<T> {
  const api = useApiClient();
  return useQuery({ queryKey: key, queryFn: ({ signal }) => api.get(path, { schema, signal }) });
}

export function useTenant(): UseQueryResult<TenantProfile> {
  return useCoreQuery(CORE_KEYS.tenant, '/v1/tenant', tenantProfileSchema);
}

export function useSites(): UseQueryResult<SiteListResponse> {
  return useCoreQuery(CORE_KEYS.sites, '/v1/sites', siteListResponseSchema);
}

export function useOrgUnits(): UseQueryResult<OrgUnitListResponse> {
  return useCoreQuery(CORE_KEYS.units, '/v1/org-units', orgUnitListResponseSchema);
}

export function usePositions(): UseQueryResult<PositionListResponse> {
  return useCoreQuery(CORE_KEYS.positions, '/v1/positions', positionListResponseSchema);
}

export function useCostCenters(): UseQueryResult<CostCenterListResponse> {
  return useCoreQuery(CORE_KEYS.costCenters, '/v1/cost-centers', costCenterListResponseSchema);
}

export function useCatalogs(): UseQueryResult<CatalogListResponse> {
  return useCoreQuery(CORE_KEYS.catalogs, '/v1/catalogs', catalogListResponseSchema);
}

export function useCatalog(key: string): UseQueryResult<CatalogDetailResponse> {
  return useCoreQuery(CORE_KEYS.catalog(key), `/v1/catalogs/${key}`, catalogDetailResponseSchema);
}

export function useParameters(): UseQueryResult<ParameterListResponse> {
  return useCoreQuery(CORE_KEYS.parameters, '/v1/parameters', parameterListResponseSchema);
}

export function useParameterHistory(key: string): UseQueryResult<ParameterHistoryResponse> {
  const path = `/v1/parameters/${key}/history`;
  return useCoreQuery(CORE_KEYS.parameterHistory(key), path, parameterHistoryResponseSchema);
}

export function useSequences(): UseQueryResult<SequenceListResponse> {
  return useCoreQuery(CORE_KEYS.sequences, '/v1/sequences', sequenceListResponseSchema);
}

export function useHolidays(year: number): UseQueryResult<HolidayListResponse> {
  const path = `/v1/holidays?year=${String(year)}`;
  return useCoreQuery(CORE_KEYS.holidays(year), path, holidayListResponseSchema);
}

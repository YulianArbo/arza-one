'use client';

import {
  campaignListResponseSchema,
  crmActivityListResponseSchema,
  funnelReportSchema,
  leadDetailSchema,
  leadListResponseSchema,
  noticeListResponseSchema,
  opportunityDetailSchema,
  opportunityListResponseSchema,
  PRIVACY_ERROR_CODES,
  type CampaignListResponse,
  type CrmActivityListResponse,
  type FunnelReport,
  type LeadDetail,
  type LeadListResponse,
  type NoticeListResponse,
  type OpportunityDetail,
  type OpportunityListResponse,
} from '@arza/contracts';
import { useQuery, type UseQueryResult } from '@tanstack/react-query';
import { useEffect } from 'react';
import type { z } from 'zod';

import { ApiError } from '../../lib/api/api-error';
import { useApiClient } from '../../lib/api/api-provider';
import { queryString } from '../parties/queries';

// Consultas del CRM (B22). La API revisa el permiso y el aislamiento en cada una.

/** Toda acción del CRM recarga lo del CRM: listas, fichas, actividades e informe. */
export const CRM_KEYS = {
  all: ['crm'] as const,
  leads: (search: string) => ['crm', 'leads', search] as const,
  lead: (id: string) => ['crm', 'lead', id] as const,
  opportunities: (search: string) => ['crm', 'opportunities', search] as const,
  opportunity: (id: string) => ['crm', 'opportunity', id] as const,
  activities: (search: string) => ['crm', 'activities', search] as const,
  campaigns: ['crm', 'campaigns'] as const,
  funnel: (search: string) => ['crm', 'funnel', search] as const,
  notices: ['crm', 'authorization-notices'] as const,
};

export type Filters = Readonly<Record<string, string | null | undefined>>;

function useCrmQuery<T>(
  key: readonly unknown[],
  path: string,
  schema: z.ZodType<T>,
  enabled = true,
): UseQueryResult<T> {
  const api = useApiClient();
  return useQuery({
    queryKey: key,
    queryFn: ({ signal }) => api.get(path, { schema, signal }),
    enabled,
  });
}

function withQuery(path: string, filters: Filters): string {
  const search = queryString(filters);
  return search === '' ? path : `${path}?${search}`;
}

export function useLeads(filters: Filters): UseQueryResult<LeadListResponse> {
  const path = withQuery('/v1/crm/leads', filters);
  return useCrmQuery(CRM_KEYS.leads(path), path, leadListResponseSchema);
}

export function useLead(id: string): UseQueryResult<LeadDetail> {
  return useCrmQuery(CRM_KEYS.lead(id), `/v1/crm/leads/${id}`, leadDetailSchema);
}

export function useOpportunities(filters: Filters): UseQueryResult<OpportunityListResponse> {
  const path = withQuery('/v1/crm/opportunities', filters);
  return useCrmQuery(CRM_KEYS.opportunities(path), path, opportunityListResponseSchema);
}

export function useOpportunity(id: string): UseQueryResult<OpportunityDetail> {
  return useCrmQuery(
    CRM_KEYS.opportunity(id),
    `/v1/crm/opportunities/${id}`,
    opportunityDetailSchema,
  );
}

export function useActivities(filters: Filters): UseQueryResult<CrmActivityListResponse> {
  const path = withQuery('/v1/crm/activities', filters);
  return useCrmQuery(CRM_KEYS.activities(path), path, crmActivityListResponseSchema);
}

export function useCampaigns(enabled = true): UseQueryResult<CampaignListResponse> {
  return useCrmQuery(CRM_KEYS.campaigns, '/v1/crm/campaigns', campaignListResponseSchema, enabled);
}

export function useFunnel(filters: Filters): UseQueryResult<FunnelReport> {
  const path = withQuery('/v1/crm/reports/funnel', filters);
  return useCrmQuery(CRM_KEYS.funnel(path), path, funnelReportSchema);
}

/**
 * Textos de autorización vigentes para el formulario del prospecto (B17). Si al guardar la API dice
 * que el texto cambió (`saveError`), se vuelven a pedir para mostrar el nuevo.
 */
export function useLeadNotices(saveError: unknown): UseQueryResult<NoticeListResponse> {
  const query = useCrmQuery(
    CRM_KEYS.notices,
    '/v1/crm/leads/authorization-notices',
    noticeListResponseSchema,
  );
  const { refetch } = query;
  const outdated =
    saveError instanceof ApiError && saveError.code === PRIVACY_ERROR_CODES.noticeOutdated;
  useEffect(() => {
    if (outdated) void refetch();
  }, [outdated, saveError, refetch]);
  return query;
}

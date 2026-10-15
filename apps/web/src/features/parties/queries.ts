'use client';

import {
  bankAccountListResponseSchema,
  contactListResponseSchema,
  dueDiligenceListResponseSchema,
  partyDetailSchema,
  partyListResponseSchema,
  partySearchResponseSchema,
  timelineResponseSchema,
  type BankAccountListResponse,
  type ContactListResponse,
  type DueDiligenceListResponse,
  type PartyDetail,
  type PartyListResponse,
  type PartySearchResponse,
  type TimelineResponse,
} from '@arza/contracts';
import { useQuery, type UseQueryResult } from '@tanstack/react-query';

import { useApiClient } from '../../lib/api/api-provider';

// Consultas de terceros (B13). La API revisa el permiso y el aislamiento en cada una.

/** Toda acción sobre un tercero recarga lo de terceros: ficha, listas y línea de tiempo. */
export const PARTY_KEYS = {
  all: ['parties'] as const,
  list: (filters: PartyFilters, cursor: string | null) =>
    ['parties', 'list', filters, cursor] as const,
  search: (query: string) => ['parties', 'search', query] as const,
  detail: (id: string) => ['parties', id] as const,
  contacts: (id: string) => ['parties', id, 'contacts'] as const,
  accounts: (id: string) => ['parties', id, 'bank-accounts'] as const,
  reviews: (id: string) => ['parties', id, 'due-diligence'] as const,
  timeline: (id: string, cursor: string | null) => ['parties', id, 'timeline', cursor] as const,
};

export interface PartyFilters {
  readonly q: string;
  readonly role: string;
  readonly status: string;
}

/** Parámetros de la dirección sin los vacíos. */
export function queryString(params: Readonly<Record<string, string | null | undefined>>): string {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== null && value !== undefined && value.trim() !== '') search.set(key, value.trim());
  }
  return search.toString();
}

export function useParties(
  filters: PartyFilters,
  cursor: string | null,
): UseQueryResult<PartyListResponse> {
  const api = useApiClient();
  const query = queryString({ ...filters, cursor });
  return useQuery({
    queryKey: PARTY_KEYS.list(filters, cursor),
    queryFn: ({ signal }) =>
      api.get(`/v1/parties?${query}`, { schema: partyListResponseSchema, signal }),
  });
}

/** Posibles duplicados; no consulta si no hay nada que comparar. */
export function useDuplicates(query: string): UseQueryResult<PartySearchResponse> {
  const api = useApiClient();
  return useQuery({
    queryKey: PARTY_KEYS.search(query),
    queryFn: ({ signal }) =>
      api.get(`/v1/parties/search?${query}`, { schema: partySearchResponseSchema, signal }),
    enabled: query !== '',
  });
}

export function useParty(id: string): UseQueryResult<PartyDetail> {
  const api = useApiClient();
  return useQuery({
    queryKey: PARTY_KEYS.detail(id),
    queryFn: ({ signal }) => api.get(`/v1/parties/${id}`, { schema: partyDetailSchema, signal }),
  });
}

export function useContacts(id: string): UseQueryResult<ContactListResponse> {
  const api = useApiClient();
  return useQuery({
    queryKey: PARTY_KEYS.contacts(id),
    queryFn: ({ signal }) =>
      api.get(`/v1/parties/${id}/contacts`, { schema: contactListResponseSchema, signal }),
  });
}

export function useBankAccounts(id: string): UseQueryResult<BankAccountListResponse> {
  const api = useApiClient();
  return useQuery({
    queryKey: PARTY_KEYS.accounts(id),
    queryFn: ({ signal }) =>
      api.get(`/v1/parties/${id}/bank-accounts`, { schema: bankAccountListResponseSchema, signal }),
  });
}

export function useDueDiligence(id: string): UseQueryResult<DueDiligenceListResponse> {
  const api = useApiClient();
  return useQuery({
    queryKey: PARTY_KEYS.reviews(id),
    queryFn: ({ signal }) =>
      api.get(`/v1/parties/${id}/due-diligence`, {
        schema: dueDiligenceListResponseSchema,
        signal,
      }),
  });
}

export function useTimeline(id: string, cursor: string | null): UseQueryResult<TimelineResponse> {
  const api = useApiClient();
  const query = queryString({ cursor });
  return useQuery({
    queryKey: PARTY_KEYS.timeline(id, cursor),
    queryFn: ({ signal }) =>
      api.get(`/v1/parties/${id}/timeline?${query}`, { schema: timelineResponseSchema, signal }),
  });
}

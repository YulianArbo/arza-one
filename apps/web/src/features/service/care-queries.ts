'use client';

import {
  kbArticleDetailSchema,
  kbArticleListResponseSchema,
  pqrsfDetailSchema,
  pqrsfListResponseSchema,
  pqrsfOptionsSchema,
  surveyListResponseSchema,
  surveyResultsSchema,
  type KbArticleDetail,
  type KbArticleListResponse,
  type PqrsfDetail,
  type PqrsfListResponse,
  type PqrsfOptions,
  type SurveyListResponse,
  type SurveyResults,
} from '@arza/contracts';
import { useQuery, type UseQueryResult } from '@tanstack/react-query';
import type { z } from 'zod';

import { useApiClient } from '../../lib/api/api-provider';
import { queryString } from '../parties/queries';

// Consultas de las PQRSF, las encuestas y la base de conocimiento (B29). Comparten la llave
// «service» con la mesa de ayuda: toda acción de Servicio las vuelve a pedir (useServiceAction).

const CARE_KEY = ['service'] as const;

function useCareQuery<T>(path: string, schema: z.ZodType<T>, enabled = true): UseQueryResult<T> {
  const api = useApiClient();
  return useQuery({
    queryKey: [...CARE_KEY, path],
    queryFn: ({ signal }) => api.get(path, { schema, signal }),
    enabled,
  });
}

function withQuery(base: string, filters: Readonly<Record<string, string | null | undefined>>) {
  const search = queryString(filters);
  return search === '' ? base : `${base}?${search}`;
}

export function usePqrsfList(
  filters: Readonly<Record<string, string | null | undefined>>,
): UseQueryResult<PqrsfListResponse> {
  return useCareQuery(withQuery('/v1/pqrsf', filters), pqrsfListResponseSchema);
}

export function usePqrsf(id: string): UseQueryResult<PqrsfDetail> {
  return useCareQuery(`/v1/pqrsf/${id}`, pqrsfDetailSchema);
}

/** A quién se puede asignar (solo quien clasifica). */
export function usePqrsfOptions(enabled: boolean): UseQueryResult<PqrsfOptions> {
  return useCareQuery('/v1/pqrsf/options', pqrsfOptionsSchema, enabled);
}

export function useSurveys(): UseQueryResult<SurveyListResponse> {
  return useCareQuery('/v1/surveys', surveyListResponseSchema);
}

export function useSurveyResults(from: string, to: string): UseQueryResult<SurveyResults> {
  return useCareQuery(withQuery('/v1/survey-responses', { from, to }), surveyResultsSchema);
}

export function useKbArticles(
  filters: Readonly<Record<string, string | null | undefined>>,
): UseQueryResult<KbArticleListResponse> {
  return useCareQuery(withQuery('/v1/kb-articles', filters), kbArticleListResponseSchema);
}

export function useKbArticle(id: string): UseQueryResult<KbArticleDetail> {
  return useCareQuery(`/v1/kb-articles/${id}`, kbArticleDetailSchema);
}

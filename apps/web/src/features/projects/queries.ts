'use client';

import {
  BOARD_REFRESH_SECONDS,
  boardSchema,
  codeReviewListResponseSchema,
  deliverableListResponseSchema,
  deliveryOptionsSchema,
  incidentListResponseSchema,
  indicatorsSchema,
  releaseListResponseSchema,
  riskListResponseSchema,
  timeListResponseSchema,
  timeOptionsSchema,
  itemListResponseSchema,
  projectDetailSchema,
  projectListResponseSchema,
  projectOptionsSchema,
  type ItemListResponse,
  type ProjectBoard,
  type ProjectDetail,
  type ProjectListResponse,
  type ProjectOptions,
  type CodeReviewListResponse,
  type DeliverableListResponse,
  type DeliveryOptions,
  type IncidentListResponse,
  type ProjectIndicators,
  type ReleaseListResponse,
  type RiskListResponse,
  type TimeListResponse,
  type TimeOptions,
} from '@arza/contracts';
import { useQuery, type UseQueryResult } from '@tanstack/react-query';
import type { z } from 'zod';

import { useApiClient } from '../../lib/api/api-provider';
import type { AdminAction } from '../administration/admin-action';
import { useAdminAction } from '../administration/admin-action';
import { queryString } from '../parties/queries';

// Consultas de Proyectos (B26 y B27). La API revisa el permiso, la pertenencia al proyecto y el
// aislamiento en cada una. El tablero se vuelve a pedir cada pocos segundos para ver lo que otros
// movieron.

const PROJECT_KEYS = {
  all: ['projects'] as const,
  list: (search: string) => ['projects', 'list', search] as const,
  detail: (id: string) => ['projects', 'detail', id] as const,
  options: ['projects', 'options'] as const,
  items: (id: string, search: string) => ['projects', 'items', id, search] as const,
  board: (id: string) => ['projects', 'board', id] as const,
  part: (id: string, part: string) => ['projects', 'part', id, part] as const,
};

type Filters = Readonly<Record<string, string | null | undefined>>;

function withQuery(path: string, filters: Filters): string {
  const search = queryString(filters);
  return search === '' ? path : `${path}?${search}`;
}

export function useProjects(filters: Filters): UseQueryResult<ProjectListResponse> {
  const api = useApiClient();
  const path = withQuery('/v1/projects', filters);
  return useQuery({
    queryKey: PROJECT_KEYS.list(path),
    queryFn: ({ signal }) => api.get(path, { schema: projectListResponseSchema, signal }),
  });
}

export function useProject(id: string): UseQueryResult<ProjectDetail> {
  const api = useApiClient();
  return useQuery({
    queryKey: PROJECT_KEYS.detail(id),
    queryFn: ({ signal }) => api.get(`/v1/projects/${id}`, { schema: projectDetailSchema, signal }),
  });
}

/** Contratos vigentes sin proyecto y quién puede entrar al equipo (solo quien crea proyectos). */
export function useProjectOptions(enabled = true): UseQueryResult<ProjectOptions> {
  const api = useApiClient();
  return useQuery({
    queryKey: PROJECT_KEYS.options,
    queryFn: ({ signal }) =>
      api.get('/v1/projects/options', { schema: projectOptionsSchema, signal }),
    enabled,
  });
}

export function useProjectItems(id: string, filters: Filters): UseQueryResult<ItemListResponse> {
  const api = useApiClient();
  const path = withQuery(`/v1/projects/${id}/items`, filters);
  return useQuery({
    queryKey: PROJECT_KEYS.items(id, path),
    queryFn: ({ signal }) => api.get(path, { schema: itemListResponseSchema, signal }),
  });
}

/** El tablero, que se refresca solo mientras la pantalla está abierta. */
export function useBoard(id: string): UseQueryResult<ProjectBoard> {
  const api = useApiClient();
  return useQuery({
    queryKey: PROJECT_KEYS.board(id),
    queryFn: ({ signal }) => api.get(`/v1/projects/${id}/board`, { schema: boardSchema, signal }),
    refetchInterval: BOARD_REFRESH_SECONDS * 1000,
  });
}

/** Una sección del proyecto (B27) leída de la API con su esquema. */
function usePart<T>(
  projectId: string,
  path: string,
  schema: z.ZodType<T>,
  enabled = true,
): UseQueryResult<T> {
  const api = useApiClient();
  const full = `/v1/projects/${projectId}/${path}`;
  return useQuery({
    queryKey: PROJECT_KEYS.part(projectId, path),
    queryFn: ({ signal }) => api.get(full, { schema, signal }),
    enabled,
  });
}

export function useTimeEntries(id: string, filters: Filters): UseQueryResult<TimeListResponse> {
  return usePart(id, withQuery('time-entries', filters), timeListResponseSchema);
}

export function useDeliverables(id: string): UseQueryResult<DeliverableListResponse> {
  return usePart(id, 'deliverables', deliverableListResponseSchema);
}

export function useDeliveryOptions(id: string, enabled: boolean): UseQueryResult<DeliveryOptions> {
  return usePart(id, 'deliverables/options', deliveryOptionsSchema, enabled);
}

export function useCodeReviews(id: string): UseQueryResult<CodeReviewListResponse> {
  return usePart(id, 'code-reviews', codeReviewListResponseSchema);
}

export function useRisks(id: string): UseQueryResult<RiskListResponse> {
  return usePart(id, 'risks', riskListResponseSchema);
}

export function useReleases(id: string): UseQueryResult<ReleaseListResponse> {
  return usePart(id, 'releases', releaseListResponseSchema);
}

export function useIncidents(id: string): UseQueryResult<IncidentListResponse> {
  return usePart(id, 'incidents', incidentListResponseSchema);
}

export function useIndicators(id: string): UseQueryResult<ProjectIndicators> {
  return usePart(id, 'indicators', indicatorsSchema);
}

/** «Mis horas»: las de la persona en todos sus proyectos, y dónde puede registrar. */
export function useMyTime(filters: Filters): UseQueryResult<TimeListResponse> {
  const api = useApiClient();
  const path = withQuery('/v1/time-entries/mine', filters);
  return useQuery({
    queryKey: ['projects', 'my-time', path],
    queryFn: ({ signal }) => api.get(path, { schema: timeListResponseSchema, signal }),
  });
}

export function useTimeOptions(): UseQueryResult<TimeOptions> {
  const api = useApiClient();
  return useQuery({
    queryKey: ['projects', 'time-options'],
    queryFn: ({ signal }) =>
      api.get('/v1/time-entries/options', { schema: timeOptionsSchema, signal }),
  });
}

/** Toda acción de Proyectos recarga lo de Proyectos: la ficha, la lista y el tablero. */
export function useProjectAction<TArgs, TResult = void>(
  run: (args: TArgs, csrfToken: string) => Promise<TResult>,
  onSuccess?: (result: TResult, args: TArgs) => void,
): AdminAction<TArgs, TResult> {
  return useAdminAction<TArgs, TResult>({
    run,
    invalidate: [PROJECT_KEYS.all],
    reason: 'Los cambios de los proyectos quedan en la auditoría.',
    ...(onSuccess === undefined ? {} : { onSuccess }),
  });
}

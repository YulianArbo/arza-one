'use client';

import {
  definitionListResponseSchema,
  definitionSchema,
  instanceSchema,
  taskListResponseSchema,
  taskSchema,
  type DefinitionListResponse,
  type DefinitionView,
  type InstanceView,
  type TaskListResponse,
  type TaskView,
} from '@arza/contracts';
import { useQuery, type UseQueryResult } from '@tanstack/react-query';

import { useApiClient } from '../../lib/api/api-provider';

// Consultas de las tareas, los trámites y el editor de flujos (B15). La API revisa el permiso y
// el aislamiento en cada una; la web solo decide qué mostrar.

export const WF_KEYS = {
  all: ['wf'] as const,
  mine: (view: string) => ['wf', 'tasks', 'mine', view] as const,
  board: ['wf', 'tasks', 'board'] as const,
  task: (id: string) => ['wf', 'tasks', id] as const,
  instance: (id: string) => ['wf', 'instances', id] as const,
  definitions: ['wf', 'definitions'] as const,
  definition: (id: string) => ['wf', 'definitions', id] as const,
};

export type InboxView = 'open' | 'overdue' | 'closed';

export function useMyTasks(view: InboxView): UseQueryResult<TaskListResponse> {
  const api = useApiClient();
  return useQuery({
    queryKey: WF_KEYS.mine(view),
    queryFn: ({ signal }) =>
      api.get(`/v1/tasks/mine?view=${view}`, { schema: taskListResponseSchema, signal }),
  });
}

export interface BoardFilters {
  readonly status: string;
  readonly escalated: boolean;
}

function boardPath(filters: BoardFilters, cursor: string | null): string {
  const params = new URLSearchParams({ limit: '25' });
  if (filters.status !== '') params.set('status', filters.status);
  if (filters.escalated) params.set('escalated', 'true');
  if (cursor !== null) params.set('cursor', cursor);
  return `/v1/tasks?${params.toString()}`;
}

export function useTaskBoard(
  filters: BoardFilters,
  cursor: string | null,
): UseQueryResult<TaskListResponse> {
  const api = useApiClient();
  return useQuery({
    queryKey: [...WF_KEYS.board, filters, cursor],
    queryFn: ({ signal }) =>
      api.get(boardPath(filters, cursor), { schema: taskListResponseSchema, signal }),
  });
}

export function useTask(id: string): UseQueryResult<TaskView> {
  const api = useApiClient();
  return useQuery({
    queryKey: WF_KEYS.task(id),
    queryFn: ({ signal }) => api.get(`/v1/tasks/${id}`, { schema: taskSchema, signal }),
  });
}

export function useInstance(id: string): UseQueryResult<InstanceView> {
  const api = useApiClient();
  return useQuery({
    queryKey: WF_KEYS.instance(id),
    queryFn: ({ signal }) =>
      api.get(`/v1/workflow-instances/${id}`, { schema: instanceSchema, signal }),
  });
}

export function useDefinitions(): UseQueryResult<DefinitionListResponse> {
  const api = useApiClient();
  return useQuery({
    queryKey: WF_KEYS.definitions,
    queryFn: ({ signal }) =>
      api.get('/v1/workflows', { schema: definitionListResponseSchema, signal }),
  });
}

export function useDefinition(id: string): UseQueryResult<DefinitionView> {
  const api = useApiClient();
  return useQuery({
    queryKey: WF_KEYS.definition(id),
    queryFn: ({ signal }) => api.get(`/v1/workflows/${id}`, { schema: definitionSchema, signal }),
  });
}

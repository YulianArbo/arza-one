'use client';

import { useApiClient } from '../../lib/api/api-provider';
import { useAdminAction, type AdminAction } from '../administration/admin-action';
import { WF_KEYS } from './queries';

// Acciones sobre las tareas y los trámites (numeral 14.3). Al terminar se recargan todas las
// consultas de flujos: la bandeja, la tarea, el trámite y su historial cambian a la vez.

const REASON = 'Esta acción cambia un trámite.';

export type TaskActionName = 'start' | 'complete' | 'approve' | 'reject' | 'delegate' | 'reassign';

export interface TaskActionArgs {
  readonly action: TaskActionName;
  readonly body: object;
}

export function useTaskAction(taskId: string): AdminAction<TaskActionArgs, void> {
  const api = useApiClient();
  return useAdminAction<TaskActionArgs>({
    run: ({ action, body }, csrfToken) =>
      api.post(`/v1/tasks/${taskId}/actions/${action}`, { body, csrfToken }),
    invalidate: [WF_KEYS.all],
    reason: REASON,
  });
}

export interface InstanceActionArgs {
  readonly action: string;
  readonly comment: string;
}

export function useInstanceAction(instanceId: string): AdminAction<InstanceActionArgs, void> {
  const api = useApiClient();
  return useAdminAction<InstanceActionArgs>({
    run: ({ action, comment }, csrfToken) =>
      api.post(`/v1/workflow-instances/${instanceId}/actions/${action}`, {
        body: comment === '' ? {} : { comment },
        csrfToken,
      }),
    invalidate: [WF_KEYS.all],
    reason: REASON,
  });
}

/** Cuerpo con el comentario solo si se escribió: la API no acepta un comentario vacío. */
export function withComment(body: object, comment: string): object {
  return comment === '' ? body : { ...body, comment };
}

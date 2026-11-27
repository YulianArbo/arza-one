'use client';

import {
  aiAnswerSchema,
  aiStatusSchema,
  type AiAnswer,
  type AiReview,
  type AiStatus,
  type AiTargetUseCase,
} from '@arza/contracts';
import { useQuery, type UseQueryResult } from '@tanstack/react-query';
import type { z } from 'zod';

import { useApiClient } from '../../lib/api/api-provider';
import { useAdminAction, type AdminAction } from '../administration/admin-action';
import { usePermissions } from '../session/permissions';

// Consultas del asistente de IA (B47). La API revisa el permiso, lo que la persona puede ver, el
// uso activo, el límite del día y el aislamiento entre empresas en cada petición.

export const ASSISTANT_KEY = ['assistant'] as const;
const REASON = 'Cada uso del asistente queda en la auditoría.';

export function useAssistantQuery<T>(
  path: string,
  schema: z.ZodType<T>,
  enabled = true,
): UseQueryResult<T> {
  const api = useApiClient();
  return useQuery({
    queryKey: [...ASSISTANT_KEY, path],
    queryFn: ({ signal }) => api.get(path, { schema, signal }),
    enabled,
  });
}

/** Estado del asistente; solo se pide si la persona puede usarlo. */
export function useAssistantStatus(): UseQueryResult<AiStatus> {
  const { can } = usePermissions();
  return useAssistantQuery('/v1/ai/status', aiStatusSchema, can('ai.assist.use'));
}

/** Acción del asistente que recarga sus consultas al terminar. */
export function useAssistantAction<TArgs, TResult = void>(
  run: (args: TArgs, csrfToken: string) => Promise<TResult>,
  successMessage: string | null = null,
): AdminAction<TArgs, TResult> {
  return useAdminAction<TArgs, TResult>({
    run,
    invalidate: [ASSISTANT_KEY],
    reason: REASON,
    successMessage,
  });
}

/** Pregunta libre sobre los documentos. */
export function useAsk(): AdminAction<string, AiAnswer> {
  const api = useApiClient();
  return useAssistantAction(async (question: string, csrfToken) =>
    api.post('/v1/ai/search', { body: { question }, schema: aiAnswerSchema, csrfToken }),
  );
}

/** Resumen, borrador o clasificación sugerida de un registro. */
export function useAssist(targetId: string): AdminAction<AiTargetUseCase, AiAnswer> {
  const api = useApiClient();
  return useAssistantAction(async (useCase: AiTargetUseCase, csrfToken) =>
    api.post('/v1/ai/assist', {
      body: { use_case: useCase, target_id: targetId },
      schema: aiAnswerSchema,
      csrfToken,
    }),
  );
}

/** La persona dice si usó la propuesta (decisión 5). */
export function useReview(requestId: string): AdminAction<AiReview, void> {
  const api = useApiClient();
  return useAssistantAction(async (decision: AiReview, csrfToken) => {
    await api.post(`/v1/ai/requests/${requestId}/review`, { body: { decision }, csrfToken });
  }, 'Gracias: quedó registrado.');
}

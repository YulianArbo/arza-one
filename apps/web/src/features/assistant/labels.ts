import {
  AI_INPUT_CLASSES,
  AI_OUTCOMES,
  AI_PROMPT_STATUSES,
  AI_REVIEWS,
  AI_SOURCE_KINDS,
  AI_USE_CASES,
  type AiOutcome,
  type AiSource,
  type AiTargetUseCase,
} from '@arza/contracts';

import { documentPath } from '../documents/labels';
import { SERVICE_PATHS } from '../service/labels';

// Textos y direcciones del asistente de IA (B47, numeral 16.6: sin jerga, trato de usted).

const BASE = '/app/asistente';

export const ASSISTANT_PATHS = {
  home: BASE,
  usage: `${BASE}/registro`,
  useCases: `${BASE}/usos`,
  prompts: `${BASE}/instrucciones`,
} as const;

/** Quien usa o gobierna el asistente lo ve en el menú (M20, B47). */
export const ASSISTANT_PERMISSIONS = [
  'ai.assist.use',
  'ai.use_case.manage',
  'ai.prompt.manage',
  'ai.request.read',
] as const;

export const USE_CASE_LABELS = AI_USE_CASES;
export const OUTCOME_LABELS = AI_OUTCOMES;
export const REVIEW_LABELS = AI_REVIEWS;
export const SOURCE_KIND_LABELS = AI_SOURCE_KINDS;
export const INPUT_CLASS_LABELS = AI_INPUT_CLASSES;
export const PROMPT_STATUS_LABELS = AI_PROMPT_STATUSES;

export const OUTCOME_TONES: Readonly<
  Record<AiOutcome, 'success' | 'info' | 'warning' | 'destructive' | 'neutral'>
> = {
  answered: 'success',
  no_sources: 'info',
  refused: 'warning',
  failed: 'destructive',
  blocked: 'neutral',
};

/** Nombre del botón de cada uso que trabaja sobre un registro. */
export const ACTION_LABELS: Readonly<Record<AiTargetUseCase, string>> = {
  doc_summary: 'Resumir el documento',
  ticket_summary: 'Resumir la conversación',
  ticket_reply: 'Borrador de respuesta',
  ticket_classify: 'Sugerir clasificación',
  pqrsf_reply: 'Borrador de respuesta',
  pqrsf_classify: 'Sugerir el tipo',
};

/** Lo que la persona debe saber de toda propuesta (ficha 17.21). */
export const PROPOSAL_NOTICE =
  'Es una propuesta del asistente: revísela y corríjala antes de usarla. El asistente no guarda ni envía nada.';

export function sourcePath(source: Pick<AiSource, 'kind' | 'id'>): string {
  if (source.kind === 'document') return documentPath(source.id);
  if (source.kind === 'ticket') return SERVICE_PATHS.ticket(source.id);
  return SERVICE_PATHS.pqrsf(source.id);
}

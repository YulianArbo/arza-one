import { z } from 'zod';

// Piezas comunes del asistente de inteligencia artificial (M20, B47, ficha 17.21). La IA propone,
// el sistema valida permisos, la persona aprueba, el sistema ejecuta y la plataforma audita.

export const AI_ERROR_CODES = {
  /** No hay proveedor configurado: el asistente está apagado (decisión 2). */
  gatewayOff: 'AI_GATEWAY_OFF',
  /** El Oficial de datos no ha activado este uso (decisión 7). */
  useCaseDisabled: 'AI_USE_CASE_DISABLED',
  /** La persona ya hizo todos los usos del día (decisión 8). */
  dailyLimit: 'AI_DAILY_LIMIT',
  /** El registro es restringido o trata de datos personales: nunca va a la IA (decisión 9). */
  sourceExcluded: 'AI_SOURCE_EXCLUDED',
  /** El proveedor no respondió o respondió algo que no se puede usar. */
  providerFailed: 'AI_PROVIDER_FAILED',
  recordNotFound: 'AI_RECORD_NOT_FOUND',
  recordInvalid: 'AI_RECORD_INVALID',
  /** Una instrucción la aprueba una persona distinta de quien la escribió. */
  selfApproval: 'AI_SELF_APPROVAL',
} as const;

function enumOf<T extends Record<string, unknown>>(
  labels: T,
): z.ZodEnum<{ [K in keyof T & string]: K }> {
  return z.enum(Object.keys(labels) as [keyof T & string, ...(keyof T & string)[]]);
}

/** Usos del asistente (ficha 17.21; B47, decisión 4). */
export const AI_USE_CASES = {
  doc_search: 'Preguntas sobre los documentos',
  doc_summary: 'Resumen de un documento',
  ticket_summary: 'Resumen de la conversación de un tiquete',
  ticket_reply: 'Borrador de respuesta a un tiquete',
  ticket_classify: 'Clasificación sugerida de un tiquete',
  pqrsf_reply: 'Borrador de respuesta a una PQRSF',
  pqrsf_classify: 'Clasificación sugerida de una PQRSF',
} as const;

export type AiUseCase = keyof typeof AI_USE_CASES;
export const aiUseCaseSchema = enumOf(AI_USE_CASES).describe('Uso del asistente');

/** Usos que trabajan sobre un registro (todos menos la pregunta libre). */
export const AI_TARGET_USE_CASES = [
  'doc_summary',
  'ticket_summary',
  'ticket_reply',
  'ticket_classify',
  'pqrsf_reply',
  'pqrsf_classify',
] as const satisfies readonly AiUseCase[];

export type AiTargetUseCase = (typeof AI_TARGET_USE_CASES)[number];
export const aiTargetUseCaseSchema = z.enum(AI_TARGET_USE_CASES);

/** Cómo terminó cada uso (registro de la ficha 17.21: caso de uso, modelo y resultado). */
export const AI_OUTCOMES = {
  answered: 'Respondió',
  no_sources: 'Sin fuentes',
  refused: 'El modelo declinó',
  failed: 'Falló',
  blocked: 'Bloqueado',
} as const;

export type AiOutcome = keyof typeof AI_OUTCOMES;
export const aiOutcomeSchema = enumOf(AI_OUTCOMES).describe('Resultado');

/** Qué decidió la persona sobre la propuesta (decisión 5). */
export const AI_REVIEWS = { accepted: 'La usó', discarded: 'La descartó' } as const;
export type AiReview = keyof typeof AI_REVIEWS;
export const aiReviewSchema = enumOf(AI_REVIEWS).describe('Decisión de la persona');

/** Proveedor de la pasarela (decisión 2): apagado, ensayo local o Claude de Anthropic. */
export const AI_PROVIDERS = {
  off: 'Apagado',
  rehearsal: 'Modo de ensayo',
  anthropic: 'Claude (Anthropic)',
} as const;

export type AiProvider = keyof typeof AI_PROVIDERS;
export const aiProviderSchema = enumOf(AI_PROVIDERS);

/** Clase de lo que se envió al modelo (numeral 12.4); lo restringido nunca se envía. */
export const AI_INPUT_CLASSES = {
  none: 'Solo la pregunta',
  internal: 'Interna',
  confidential: 'Confidencial',
} as const;

export type AiInputClass = keyof typeof AI_INPUT_CLASSES;
export const aiInputClassSchema = enumOf(AI_INPUT_CLASSES);

/** Clases de registro que una respuesta puede citar. */
export const AI_SOURCE_KINDS = {
  document: 'Documento',
  ticket: 'Tiquete',
  pqrsf: 'PQRSF',
} as const;
export type AiSourceKind = keyof typeof AI_SOURCE_KINDS;
export const aiSourceKindSchema = enumOf(AI_SOURCE_KINDS);

export const aiRefSchema = z.object({ id: z.uuid(), name: z.string() });
export type AiRef = z.infer<typeof aiRefSchema>;

export const aiCreatedResponseSchema = z.object({ id: z.uuid() });

import { z } from 'zod';

// Piezas comunes del módulo de Calidad y mejora continua (M14, B38, ficha 17.15).

export const QMS_ERROR_CODES = {
  recordNotFound: 'QMS_RECORD_NOT_FOUND',
  recordInvalid: 'QMS_RECORD_INVALID',
  statusInvalid: 'QMS_STATUS_INVALID',
  /** La eficacia la verifica alguien distinto de quien ejecutó la acción (ficha 17.15). */
  selfVerification: 'QMS_SELF_VERIFICATION',
} as const;

export const qmsIdSchema = z.uuid();
export const qmsDateSchema = z.iso.date();
export const qmsTextSchema = (min: number, max: number): z.ZodString =>
  z.string().trim().min(min).max(max);
export const qmsOptionalText = (max: number): z.ZodDefault<z.ZodNullable<z.ZodString>> =>
  z.string().trim().max(max).nullable().default(null);

/** Un enum de Zod a partir de un diccionario de etiquetas en español. */
export function qmsEnumOf<T extends Record<string, unknown>>(
  labels: T,
): z.ZodEnum<{ [K in keyof T & string]: K }> {
  return z.enum(Object.keys(labels) as [keyof T & string, ...(keyof T & string)[]]);
}

/** Una persona o un proceso, con el nombre para mostrar. */
export const qmsRefSchema = z.object({ id: qmsIdSchema, name: z.string() });
export const qmsRefListResponseSchema = z.object({ data: z.array(qmsRefSchema) });
export const qmsCreatedResponseSchema = z.object({ id: qmsIdSchema });
export const qmsCodeResponseSchema = z.object({ id: qmsIdSchema, code: z.string() });

export type QmsRef = z.infer<typeof qmsRefSchema>;
export type QmsCreatedResponse = z.infer<typeof qmsCreatedResponseSchema>;
export type QmsCodeResponse = z.infer<typeof qmsCodeResponseSchema>;

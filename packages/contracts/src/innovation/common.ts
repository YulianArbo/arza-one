import { z } from 'zod';

// Piezas comunes de Innovación y propiedad intelectual (M15, B40, ficha 17.16).

export const INN_ERROR_CODES = {
  recordNotFound: 'INN_RECORD_NOT_FOUND',
  recordInvalid: 'INN_RECORD_INVALID',
  statusInvalid: 'INN_STATUS_INVALID',
  /** Nadie evalúa ni decide sobre su propia idea (B40, decisión 3). */
  selfDecision: 'INN_SELF_DECISION',
  /** Un registro de software no se radica sin la cesión de todos sus autores (decisión 8). */
  chainIncomplete: 'INN_CHAIN_INCOMPLETE',
} as const;

export const innIdSchema = z.uuid();
export const innDateSchema = z.iso.date();
export const innTextSchema = (min: number, max: number): z.ZodString =>
  z.string().trim().min(min).max(max);
export const innOptionalText = (max: number): z.ZodDefault<z.ZodNullable<z.ZodString>> =>
  z.string().trim().max(max).nullable().default(null);

/** Un enum de Zod a partir de un diccionario de etiquetas en español. */
export function innEnumOf<T extends Record<string, unknown>>(
  labels: T,
): z.ZodEnum<{ [K in keyof T & string]: K }> {
  return z.enum(Object.keys(labels) as [keyof T & string, ...(keyof T & string)[]]);
}

/** Una persona, con el nombre para mostrar. */
export const innRefSchema = z.object({ id: innIdSchema, name: z.string() });
export const innCreatedResponseSchema = z.object({ id: innIdSchema });
export const innCodeResponseSchema = z.object({ id: innIdSchema, code: z.string() });

export type InnRef = z.infer<typeof innRefSchema>;
export type InnCreatedResponse = z.infer<typeof innCreatedResponseSchema>;
export type InnCodeResponse = z.infer<typeof innCodeResponseSchema>;

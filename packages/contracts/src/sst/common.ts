import { z } from 'zod';

// Piezas comunes del módulo de Seguridad y salud en el trabajo (M13, B37, ficha 17.14).

export const SST_ERROR_CODES = {
  recordNotFound: 'SST_RECORD_NOT_FOUND',
  recordInvalid: 'SST_RECORD_INVALID',
  statusInvalid: 'SST_STATUS_INVALID',
} as const;

export const sstIdSchema = z.uuid();
export const sstDateSchema = z.iso.date();
export const sstTextSchema = (min: number, max: number): z.ZodString =>
  z.string().trim().min(min).max(max);
export const sstOptionalText = (max: number): z.ZodDefault<z.ZodNullable<z.ZodString>> =>
  z.string().trim().max(max).nullable().default(null);

/** Un enum de Zod a partir de un diccionario de etiquetas en español. */
export function sstEnumOf<T extends Record<string, unknown>>(
  labels: T,
): z.ZodEnum<{ [K in keyof T & string]: K }> {
  return z.enum(Object.keys(labels) as [keyof T & string, ...(keyof T & string)[]]);
}

/** Una persona o un colaborador, con el nombre para mostrar. */
export const sstRefSchema = z.object({ id: sstIdSchema, name: z.string() });
export const sstCreatedResponseSchema = z.object({ id: sstIdSchema });
export const sstRefListResponseSchema = z.object({ data: z.array(sstRefSchema) });

export type SstRef = z.infer<typeof sstRefSchema>;
export type SstCreatedResponse = z.infer<typeof sstCreatedResponseSchema>;

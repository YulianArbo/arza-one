import { z } from 'zod';

import { recordNameSchema } from './org.js';

// Consecutivos de negocio (M00, B12, ADR-021): PREFIJO-AAAA-NNNN por tipo de registro y año. El
// siguiente número no se edita a mano: así no hay saltos ni duplicados.

export const sequenceKeySchema = z
  .string()
  .trim()
  .regex(/^[a-z][a-z0-9_]*(\.[a-z0-9_]+)*$/, 'Clave inválida, por ejemplo «crm.quote»')
  .max(60);

export const sequencePrefixSchema = z
  .string()
  .trim()
  .regex(/^[A-Z]{2,6}$/, 'Use de 2 a 6 letras mayúsculas, por ejemplo COT');

export const sequencePaddingSchema = z.number().int().min(3).max(8).describe('Dígitos del número');

export const sequenceSchema = z.object({
  id: z.uuid(),
  key: z.string(),
  name: z.string(),
  prefix: z.string(),
  year: z.number().int(),
  padding: z.number().int(),
  next_value: z.number().int().describe('Número que recibirá el siguiente registro'),
  next_code: z.string().describe('Código que recibirá el siguiente registro'),
  version: z.number().int().positive(),
});

export const sequenceListResponseSchema = z.object({
  data: z.array(sequenceSchema).describe('Cada tipo con su año más reciente'),
});

export const createSequenceRequestSchema = z.strictObject({
  key: sequenceKeySchema,
  name: recordNameSchema,
  prefix: sequencePrefixSchema,
  padding: sequencePaddingSchema.default(4),
});

export const updateSequenceRequestSchema = z.strictObject({
  name: recordNameSchema,
  prefix: sequencePrefixSchema,
  padding: sequencePaddingSchema,
});

/** Código legible: COT-2026-0001. */
export function formatBusinessCode(
  prefix: string,
  year: number,
  value: number,
  padding: number,
): string {
  return `${prefix}-${String(year)}-${String(value).padStart(padding, '0')}`;
}

export type Sequence = z.infer<typeof sequenceSchema>;
export type SequenceListResponse = z.infer<typeof sequenceListResponseSchema>;
export type CreateSequenceRequest = z.infer<typeof createSequenceRequestSchema>;
export type UpdateSequenceRequest = z.infer<typeof updateSequenceRequestSchema>;

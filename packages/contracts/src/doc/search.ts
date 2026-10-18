import { z } from 'zod';

import { classificationSchema } from './folders.js';
import { documentStatusSchema } from './documents.js';

// Contratos de la búsqueda de texto completo (M03, B21; numeral 13.2): en español y sin tildes,
// sobre el código, el título y el texto de la versión vigente. Solo devuelve documentos que la
// persona puede abrir.

export const documentSearchQuerySchema = z.strictObject({
  q: z
    .string()
    .trim()
    .min(2)
    .max(100)
    .describe('Palabras o código; encuentra también el comienzo de una palabra'),
  limit: z.coerce.number().int().min(1).max(50).default(20),
});

export const documentSearchHitSchema = z.object({
  id: z.uuid(),
  code: z.string(),
  title: z.string(),
  doc_type: z.string(),
  classification: classificationSchema,
  status: documentStatusSchema,
  snippet: z
    .string()
    .nullable()
    .describe(
      'Fragmento del texto con las palabras encontradas entre [[ y ]]; nunca en los restringidos',
    ),
});

export const documentSearchResponseSchema = z.object({
  data: z.array(documentSearchHitSchema).describe('Del más al menos relacionado'),
});

export type DocumentSearchQuery = z.infer<typeof documentSearchQuerySchema>;
export type DocumentSearchHit = z.infer<typeof documentSearchHitSchema>;
export type DocumentSearchResponse = z.infer<typeof documentSearchResponseSchema>;

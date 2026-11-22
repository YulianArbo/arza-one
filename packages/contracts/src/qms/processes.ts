import { z } from 'zod';

import { qmsEnumOf, qmsIdSchema, qmsOptionalText, qmsRefSchema, qmsTextSchema } from './common.js';

// Mapa de procesos y caracterizaciones (B38, ficha 17.15; MN-SGC-001). Los procesos son los del
// organigrama del núcleo (código, nombre y cargo responsable); Calidad les agrega el tipo y la
// caracterización. Así hay una sola lista de procesos en la plataforma.

export const PROCESS_TYPES = {
  strategic: 'Estratégico',
  core: 'Misional',
  support: 'De apoyo',
  evaluation: 'De evaluación',
} as const;
export type ProcessType = keyof typeof PROCESS_TYPES;
export const processTypeSchema = qmsEnumOf(PROCESS_TYPES);

/** Caracterización de un proceso, si Calidad ya la registró. */
export const characterizationSchema = z.object({
  id: qmsIdSchema,
  process_type: processTypeSchema,
  objective: z.string(),
  scope: z.string().nullable(),
  inputs: z.string().nullable(),
  outputs: z.string().nullable(),
  document_id: qmsIdSchema.nullable(),
  version: z.number().int().positive(),
});

/** Un proceso del mapa: el del núcleo y su caracterización. */
export const qmsProcessSchema = z.object({
  id: qmsIdSchema,
  code: z.string(),
  name: z.string(),
  owner_position: qmsRefSchema.nullable(),
  characterization: characterizationSchema.nullable(),
});
export const qmsProcessListResponseSchema = z.object({ data: z.array(qmsProcessSchema) });

export const saveCharacterizationSchema = z.strictObject({
  process_type: processTypeSchema,
  objective: qmsTextSchema(5, 1000).describe('Objetivo del proceso'),
  scope: qmsOptionalText(1000),
  inputs: qmsOptionalText(2000),
  outputs: qmsOptionalText(2000),
  document_id: qmsIdSchema
    .nullable()
    .default(null)
    .describe('Documento de caracterización en Documentos'),
});

export type QmsProcess = z.infer<typeof qmsProcessSchema>;
export type Characterization = z.infer<typeof characterizationSchema>;
export type SaveCharacterization = z.infer<typeof saveCharacterizationSchema>;

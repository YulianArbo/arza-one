import { z } from 'zod';

import {
  innDateSchema,
  innEnumOf,
  innIdSchema,
  innOptionalText,
  innRefSchema,
  innTextSchema,
} from './common.js';

// Vigilancia tecnológica (FT-INN-006) y análisis de competencia (RE-INN-002) (B40, ficha 17.16).

export const WATCH_RELEVANCE = { high: 'Alta', medium: 'Media', low: 'Baja' } as const;
export const watchRelevanceSchema = innEnumOf(WATCH_RELEVANCE).describe('Relevancia');

export const watchEntrySchema = z.object({
  id: innIdSchema,
  topic: z.string(),
  source: z.string(),
  finding: z.string(),
  relevance: watchRelevanceSchema,
  observed_on: innDateSchema,
  recorded_by: innRefSchema,
  version: z.number().int().positive(),
});
export const watchListResponseSchema = z.object({ data: z.array(watchEntrySchema) });

export const saveWatchEntrySchema = z.strictObject({
  topic: innTextSchema(3, 160).describe('Tema vigilado'),
  source: innTextSchema(3, 300).describe('Fuente: sitio, publicación, evento'),
  finding: innTextSchema(10, 4000).describe('Qué se encontró y qué significa para la empresa'),
  relevance: watchRelevanceSchema,
  observed_on: innDateSchema.describe('Fecha del hallazgo'),
});

export const competitorSchema = z.object({
  id: innIdSchema,
  name: z.string(),
  segment: z.string(),
  website: z.string().nullable(),
  strengths: z.string(),
  weaknesses: z.string(),
  updated_on: innDateSchema,
  version: z.number().int().positive(),
});
export const competitorListResponseSchema = z.object({ data: z.array(competitorSchema) });

export const saveCompetitorSchema = z.strictObject({
  name: innTextSchema(2, 160).describe('Nombre del competidor'),
  segment: innTextSchema(2, 160).describe('Segmento en el que compite'),
  website: innOptionalText(300),
  strengths: innTextSchema(3, 2000).describe('Fortalezas'),
  weaknesses: innTextSchema(3, 2000).describe('Debilidades'),
  updated_on: innDateSchema.describe('Fecha del análisis'),
});

export type WatchEntry = z.infer<typeof watchEntrySchema>;
export type SaveWatchEntry = z.infer<typeof saveWatchEntrySchema>;
export type Competitor = z.infer<typeof competitorSchema>;
export type SaveCompetitor = z.infer<typeof saveCompetitorSchema>;

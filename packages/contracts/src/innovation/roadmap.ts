import { z } from 'zod';

import {
  innDateSchema,
  innEnumOf,
  innIdSchema,
  innOptionalText,
  innRefSchema,
  innTextSchema,
} from './common.js';

// Hoja de ruta de productos propios (B40, ficha 17.16; FT-INN-004). El producto es texto libre
// con sugerencias (decisión 9). Al liberar una versión se propone su registro ante la Dirección
// Nacional de Derecho de Autor (decisión 7).

export const ROADMAP_STATUSES = {
  planned: 'Planeado',
  in_progress: 'En curso',
  released: 'Liberado',
  cancelled: 'Cancelado',
} as const;
export type RoadmapStatus = keyof typeof ROADMAP_STATUSES;
export const roadmapStatusSchema = innEnumOf(ROADMAP_STATUSES).describe('Estado del hito');

/** Estados que se eligen al editar; «liberado» solo llega por la liberación. */
export const EDITABLE_ROADMAP_STATUSES = {
  planned: 'Planeado',
  in_progress: 'En curso',
  cancelled: 'Cancelado',
} as const;

/** Trimestre como 2027-T1. */
export const quarterSchema = z
  .string()
  .regex(/^20[2-9][0-9]-T[1-4]$/, 'Escriba el trimestre como 2027-T1.')
  .describe('Trimestre, como 2027-T1');

export const roadmapItemSchema = z.object({
  id: innIdSchema,
  product: z.string(),
  title: z.string(),
  description: z.string().nullable(),
  quarter: z.string(),
  status: roadmapStatusSchema,
  owner: innRefSchema,
  idea: z.object({ id: innIdSchema, code: z.string(), title: z.string() }).nullable(),
  version_label: z.string().nullable(),
  released_on: innDateSchema.nullable(),
  ip_asset: z.object({ id: innIdSchema, code: z.string() }).nullable(),
  version: z.number().int().positive(),
});
export const roadmapListResponseSchema = z.object({
  data: z.array(roadmapItemSchema),
  products: z.array(z.string()).describe('Productos ya escritos, para sugerirlos'),
});

export const saveRoadmapItemSchema = z.strictObject({
  product: innTextSchema(2, 80).describe('Producto propio, como ARZA ONE'),
  title: innTextSchema(3, 160).describe('Hito o funcionalidad'),
  description: innOptionalText(2000),
  quarter: quarterSchema,
  status: innEnumOf(EDITABLE_ROADMAP_STATUSES).default('planned'),
  owner_id: innIdSchema.describe('Cuenta de quien responde por el hito'),
  idea_id: innIdSchema.nullable().default(null).describe('Idea aprobada de la que nace, si la hay'),
});

export const releaseRoadmapItemSchema = z.strictObject({
  version_label: innTextSchema(1, 40).describe('Versión liberada, como 1.2.0'),
  released_on: innDateSchema.describe('Fecha de la liberación'),
});

export type RoadmapItem = z.infer<typeof roadmapItemSchema>;
export type SaveRoadmapItem = z.infer<typeof saveRoadmapItemSchema>;
export type ReleaseRoadmapItem = z.infer<typeof releaseRoadmapItemSchema>;

export const roadmapReleaseResponseSchema = z.object({
  ip_asset_id: innIdSchema.describe('Registro de software propuesto'),
});

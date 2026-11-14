import { z } from 'zod';

import { dateTimeSchema, personRefSchema, versionSchema } from '../crm/common.js';
import { optionalText, requiredText } from '../contract/common.js';
import {
  hasAtMostDecimals,
  itemPrioritySchema,
  itemStatusSchema,
  itemTypeSchema,
  reviewResultSchema,
} from './common.js';
import { sprintSchema } from './planning.js';

// La lista de pendientes y el tablero (B26, ficha 17.8): épicas, historias, tareas y defectos con
// su código del proyecto (PRY-2026-0001-12, «#12»). Un ítem no entra a una iteración sin criterios
// de aceptación y no pasa a terminado sin una revisión de código FT-TEC-002 aprobada (B27) y la
// nota de pruebas.

const estimateSchema = z
  .number()
  .min(0.5, 'La estimación va de 0,5 a 999 horas.')
  .max(999, 'La estimación va de 0,5 a 999 horas.')
  .refine((hours) => hasAtMostDecimals(hours, 1), 'Use como máximo un decimal.')
  .nullable()
  .default(null)
  .describe('Estimación en horas');

const itemDataFields = {
  parent_id: z.uuid().nullable().default(null).describe('Épica o historia a la que pertenece'),
  title: requiredText(3, 200, 'Escriba un título corto.'),
  description: optionalText(8000),
  acceptance_criteria: optionalText(4000).describe('Cuándo se da por bien hecho'),
  priority: itemPrioritySchema.default('normal'),
  estimate_hours: estimateSchema,
  assignee_id: z.uuid().nullable().default(null).describe('Miembro del equipo a cargo'),
};

export const createItemRequestSchema = z.strictObject({
  type: itemTypeSchema,
  ...itemDataFields,
});

export const updateItemRequestSchema = z.strictObject(itemDataFields);

const reviewUrlSchema = z
  .url({ protocol: /^https$/u, error: 'Escriba el enlace completo, que empiece por https://' })
  .max(500);

export const moveItemRequestSchema = z.strictObject({
  status: itemStatusSchema.describe('Columna de destino'),
  review_url: reviewUrlSchema
    .nullable()
    .default(null)
    .describe('Enlace a la revisión de código (B26); desde el B27 cuenta la revisión FT-TEC-002'),
  test_note: optionalText(2000).describe('Pruebas hechas; obligatoria para terminar'),
});

export const planItemRequestSchema = z.strictObject({
  sprint_id: z.uuid().nullable().describe('Iteración; vacío lo devuelve a la lista de pendientes'),
});

export const itemSchema = z.object({
  id: z.uuid(),
  number: z.number().int().positive(),
  code: z.string().describe('PRY-AAAA-NNNN-N'),
  type: itemTypeSchema,
  parent: z.object({ id: z.uuid(), number: z.number().int(), title: z.string() }).nullable(),
  title: z.string(),
  description: z.string().nullable(),
  acceptance_criteria: z.string().nullable(),
  status: itemStatusSchema,
  priority: itemPrioritySchema,
  estimate_hours: z.number().nullable(),
  assignee: personRefSchema.nullable(),
  sprint_id: z.uuid().nullable(),
  review_url: z.string().nullable(),
  test_note: z.string().nullable(),
  last_review: reviewResultSchema
    .nullable()
    .describe('Resultado de la última revisión de código FT-TEC-002'),
  done_at: dateTimeSchema.nullable(),
  version: versionSchema,
});

export const itemListQuerySchema = z.strictObject({
  sprint_id: z.uuid().optional().describe('Solo los de esa iteración'),
  backlog: z
    .enum(['true', 'false'])
    .optional()
    .describe('true: solo los que no están en ninguna iteración'),
  type: itemTypeSchema.optional(),
});

export const itemListResponseSchema = z.object({ data: z.array(itemSchema) });

/** El tablero: la iteración en curso con sus ítems o, si no hay, todos los abiertos. */
export const boardSchema = z.object({
  sprint: sprintSchema.nullable(),
  items: z.array(itemSchema),
  refreshed_at: dateTimeSchema,
});

export type CreateItemRequest = z.infer<typeof createItemRequestSchema>;
export type UpdateItemRequest = z.infer<typeof updateItemRequestSchema>;
export type MoveItemRequest = z.infer<typeof moveItemRequestSchema>;
export type PlanItemRequest = z.infer<typeof planItemRequestSchema>;
export type ProjectItem = z.infer<typeof itemSchema>;
export type ItemListQuery = z.infer<typeof itemListQuerySchema>;
export type ItemListResponse = z.infer<typeof itemListResponseSchema>;
export type ProjectBoard = z.infer<typeof boardSchema>;

import { z } from 'zod';

import { recordNameSchema } from './org.js';

// Catálogos administrables (M00, B12): listas que usan los formularios, como los tipos de
// documento de identidad. Las listas las define el sistema; la empresa administra sus opciones.

const versionField = z.number().int().positive();

/** Clave de un catálogo, como «identification_types». */
export const catalogKeySchema = z
  .string()
  .regex(/^[a-z][a-z0-9_]{1,59}$/, 'Clave de catálogo inválida');

export const catalogItemSchema = z.object({
  id: z.uuid(),
  code: z.string(),
  label: z.string(),
  sort_order: z.number().int(),
  is_active: z.boolean(),
  version: versionField,
});

export const catalogSummarySchema = z.object({
  key: z.string(),
  name: z.string(),
  description: z.string().nullable(),
  item_count: z.number().int(),
});

export const catalogListResponseSchema = z.object({ data: z.array(catalogSummarySchema) });

export const catalogDetailResponseSchema = catalogSummarySchema.extend({
  items: z.array(catalogItemSchema).describe('Opciones, en el orden en que se muestran'),
});

export const createCatalogItemRequestSchema = z.strictObject({
  code: z
    .string()
    .trim()
    .regex(/^[A-Z0-9][A-Z0-9_-]{0,19}$/, 'Use mayúsculas, números, guiones; máximo 20'),
  label: recordNameSchema,
  sort_order: z.number().int().min(0).max(9999).default(0),
});

export const updateCatalogItemRequestSchema = z.strictObject({
  label: recordNameSchema,
  sort_order: z.number().int().min(0).max(9999),
  is_active: z.boolean(),
});

export type CatalogItem = z.infer<typeof catalogItemSchema>;
export type CatalogSummary = z.infer<typeof catalogSummarySchema>;
export type CatalogListResponse = z.infer<typeof catalogListResponseSchema>;
export type CatalogDetailResponse = z.infer<typeof catalogDetailResponseSchema>;
export type CreateCatalogItemRequest = z.infer<typeof createCatalogItemRequestSchema>;
export type UpdateCatalogItemRequest = z.infer<typeof updateCatalogItemRequestSchema>;

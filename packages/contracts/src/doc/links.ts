import { z } from 'zod';

// Vínculos de un documento con registros de otros módulos (M03, B18; numeral 18.2, paso 3): el
// manual de funciones con su cargo, el procedimiento con su proceso, el soporte con su tercero.

export const LINK_ENTITIES = {
  position: 'Cargo',
  process: 'Proceso',
  party: 'Tercero',
} as const;

export const LINK_RELATIONS = {
  applies_to: 'Aplica a',
  supports: 'Es soporte de',
  related: 'Se relaciona con',
} as const;

export type LinkEntity = keyof typeof LINK_ENTITIES;
export type LinkRelation = keyof typeof LINK_RELATIONS;

export const linkEntitySchema = z
  .enum(Object.keys(LINK_ENTITIES) as [LinkEntity, ...LinkEntity[]])
  .describe('Cargo, proceso o tercero');

export const linkRelationSchema = z
  .enum(Object.keys(LINK_RELATIONS) as [LinkRelation, ...LinkRelation[]])
  .describe('Aplica a, es soporte de o se relaciona con');

export const documentLinkSchema = z.object({
  id: z.uuid(),
  entity_type: linkEntitySchema,
  entity_id: z.uuid(),
  entity_name: z.string().nullable().describe('Nombre del registro; null si ya no existe'),
  relation: linkRelationSchema,
});

export const documentLinkListResponseSchema = z.object({
  data: z.array(documentLinkSchema),
});

export const createDocumentLinkRequestSchema = z.strictObject({
  entity_type: linkEntitySchema,
  entity_id: z.uuid(),
  relation: linkRelationSchema,
});

export type DocumentLink = z.infer<typeof documentLinkSchema>;
export type DocumentLinkListResponse = z.infer<typeof documentLinkListResponseSchema>;
export type CreateDocumentLinkRequest = z.infer<typeof createDocumentLinkRequestSchema>;

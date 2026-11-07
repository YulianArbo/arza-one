import { z } from 'zod';

import { requiredText } from '../contract/common.js';
import { dateTimeSchema, listLimitSchema, personRefSchema, versionSchema } from '../crm/common.js';

// Base de conocimiento (B29, ficha 17.9): artículos de ayuda para el equipo interno o para los
// clientes. Servicio al cliente los escribe, los publica y los archiva; el equipo interno lee los
// publicados; los clientes leerán los suyos en el portal (B30). El cuerpo es texto sencillo: párrafos
// separados por una línea en blanco y listas con «- » al inicio de la línea (decisión 10).

function enumOf<T extends string>(labels: Readonly<Record<T, string>>) {
  return z.enum(Object.keys(labels) as [T, ...T[]]);
}

export const KB_AUDIENCES = {
  internal: 'Equipo interno',
  client: 'Clientes',
} as const;

export type KbAudience = keyof typeof KB_AUDIENCES;

export const kbAudienceSchema = enumOf(KB_AUDIENCES).describe('Para quién es');

export const KB_STATUSES = {
  draft: 'Borrador',
  published: 'Publicado',
  archived: 'Archivado',
} as const;

export type KbStatus = keyof typeof KB_STATUSES;

export const kbStatusSchema = enumOf(KB_STATUSES).describe('Estado del artículo');

export const KB_CATEGORIES = {
  platform: 'ARZA ONE (esta plataforma)',
  support: 'Soporte y aplicaciones',
  projects: 'Proyectos y entregas',
  billing: 'Facturación y pagos',
  general: 'General',
} as const;

export type KbCategory = keyof typeof KB_CATEGORIES;

export const kbCategorySchema = enumOf(KB_CATEGORIES).describe('Tema');

/** Qué paso puede seguir a cada estado (la API y la pantalla usan la misma tabla). */
export const KB_ACTIONS = {
  edit: ['draft', 'published'],
  publish: ['draft', 'archived'],
  archive: ['draft', 'published'],
} as const satisfies Record<string, readonly KbStatus[]>;

export type KbAction = keyof typeof KB_ACTIONS;

export function canKbStep(action: KbAction, status: KbStatus): boolean {
  const allowed: readonly KbStatus[] = KB_ACTIONS[action];
  return allowed.includes(status);
}

export const kbArticleRequestSchema = z.strictObject({
  title: requiredText(3, 160, 'Escriba un título.'),
  summary: requiredText(10, 300, 'Escriba un resumen de una o dos líneas.'),
  body: requiredText(10, 30000, 'Escriba el contenido del artículo.'),
  category: kbCategorySchema,
  audience: kbAudienceSchema,
});

export const kbArticleSummarySchema = z.object({
  id: z.uuid(),
  title: z.string(),
  summary: z.string(),
  category: kbCategorySchema,
  audience: kbAudienceSchema,
  status: kbStatusSchema,
  published_at: dateTimeSchema.nullable(),
  updated_at: dateTimeSchema,
});

export const kbArticleDetailSchema = kbArticleSummarySchema.extend({
  body: z.string(),
  author: personRefSchema.nullable(),
  version: versionSchema,
  can: z.object({ edit: z.boolean(), publish: z.boolean(), archive: z.boolean() }),
});

export const kbArticleListQuerySchema = z.strictObject({
  q: z.string().trim().min(2).max(120).optional().describe('Busca en título, resumen y contenido'),
  status: kbStatusSchema.optional().describe('Solo quien administra ve borradores y archivados'),
  audience: kbAudienceSchema.optional(),
  category: kbCategorySchema.optional(),
  limit: listLimitSchema,
  cursor: z.uuid().optional(),
});

export const kbArticleListResponseSchema = z.object({
  data: z.array(kbArticleSummarySchema),
  next_cursor: z.uuid().nullable(),
  can_manage: z.boolean(),
});

export type KbArticleRequest = z.infer<typeof kbArticleRequestSchema>;
export type KbArticleSummary = z.infer<typeof kbArticleSummarySchema>;
export type KbArticleDetail = z.infer<typeof kbArticleDetailSchema>;
export type KbArticleListQuery = z.infer<typeof kbArticleListQuerySchema>;
export type KbArticleListResponse = z.infer<typeof kbArticleListResponseSchema>;

import { z } from 'zod';

import {
  siteBodySchema,
  siteDateTimeSchema,
  siteEnumOf,
  siteIdSchema,
  siteRefSchema,
  siteVersionSchema,
} from './common.js';

// Páginas institucionales administrables (B41, ficha 17.18), como «Nosotros». Se ven en /{slug}; el
// inicio conserva el diseño aprobado en B22A (decisión 10).

export const PAGE_STATUSES = {
  draft: 'Borrador',
  published: 'Publicada',
  withdrawn: 'Retirada',
} as const;
export type PageStatus = keyof typeof PAGE_STATUSES;
export const pageStatusSchema = siteEnumOf(PAGE_STATUSES).describe('Estado de la página');

/** Direcciones que ya usa la plataforma: una página no puede ocuparlas. */
export const RESERVED_PAGE_SLUGS: readonly string[] = [
  'activar-cuenta',
  'aceptar-terminos',
  'api',
  'app',
  'baja',
  'cotizacion',
  'encuesta',
  'firmar',
  'healthz',
  'iniciar-sesion',
  'legal',
  'portal',
  'pqrsf',
  'recuperar-contrasena',
  'restablecer-contrasena',
  'segundo-factor',
  'verificar',
];

export const pageSlugSchema = z
  .string()
  .trim()
  .min(3)
  .max(60)
  .regex(
    /^[a-z0-9]+(?:-[a-z0-9]+)*$/u,
    'Use minúsculas, números y guiones, sin tildes ni espacios.',
  )
  .refine((slug) => !RESERVED_PAGE_SLUGS.includes(slug), 'Esa dirección ya la usa la plataforma.')
  .describe('Dirección de la página: /{slug}');

export const pageSchema = z.object({
  id: siteIdSchema,
  slug: z.string(),
  title: z.string(),
  summary: z.string().nullable(),
  body: z.string(),
  status: pageStatusSchema,
  published_at: siteDateTimeSchema.nullable(),
  updated_by: siteRefSchema.nullable(),
  version: siteVersionSchema,
});
export const pageListResponseSchema = z.object({ data: z.array(pageSchema) });

export const savePageSchema = z.strictObject({
  slug: pageSlugSchema,
  title: z.string().trim().min(3).max(120),
  summary: z.string().trim().max(300).nullable().default(null).describe('Resumen para buscadores'),
  body: siteBodySchema,
});

export const PAGE_ACTIONS = { publish: 'Publicar', withdraw: 'Retirar' } as const;
export const pageActionSchema = z.strictObject({ action: siteEnumOf(PAGE_ACTIONS) });

export const publicPageSchema = z.object({
  slug: z.string(),
  title: z.string(),
  summary: z.string().nullable(),
  body: z.string(),
  published_at: siteDateTimeSchema,
});
export const publicPageListResponseSchema = z.object({
  data: z.array(z.object({ slug: z.string(), title: z.string() })),
});

export type Page = z.infer<typeof pageSchema>;
export type SavePage = z.infer<typeof savePageSchema>;
export type PageAction = z.infer<typeof pageActionSchema>;
export type PublicPage = z.infer<typeof publicPageSchema>;
export type PublicPageList = z.infer<typeof publicPageListResponseSchema>;
export type PageListResponse = z.infer<typeof pageListResponseSchema>;

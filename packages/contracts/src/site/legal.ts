import { z } from 'zod';

import {
  siteBodySchema,
  siteDateTimeSchema,
  siteEnumOf,
  siteIdSchema,
  siteRefSchema,
  siteVersionSchema,
} from './common.js';

// Textos legales del sitio versionados (B41, numeral 20.2): borrador → aprobado → publicado →
// reemplazado. Lo publicado no cambia; al publicar una versión nueva de la misma clase, la anterior
// queda reemplazada. La política de tratamiento, el aviso de privacidad y los términos del portal
// siguen en Privacidad (decisión 1).

export const LEGAL_TEXT_KINDS = {
  site_terms: { label: 'Términos y condiciones del sitio', slug: 'terminos' },
  platform_terms: { label: 'Términos de uso de la plataforma', slug: 'terminos-de-la-plataforma' },
  cookie_policy: { label: 'Política de cookies', slug: 'cookies' },
  data_subject_rights: { label: 'Derechos del titular', slug: 'derechos-del-titular' },
  security_disclosure: {
    label: 'Seguridad y divulgación responsable',
    slug: 'seguridad',
  },
  third_party_notices: { label: 'Avisos de software de terceros', slug: 'avisos-de-terceros' },
} as const satisfies Record<string, { label: string; slug: string }>;

export type LegalTextKey = keyof typeof LEGAL_TEXT_KINDS;
export const legalTextKeySchema = siteEnumOf(LEGAL_TEXT_KINDS).describe('Clase de texto legal');

/** La clase de texto por su dirección en el sitio (/legal/{slug}). */
export function legalTextKeyOfSlug(slug: string): LegalTextKey | null {
  const entry = Object.entries(LEGAL_TEXT_KINDS).find(([, kind]) => kind.slug === slug);
  return entry === undefined ? null : (entry[0] as LegalTextKey);
}

export const LEGAL_TEXT_STATUSES = {
  draft: 'Borrador',
  approved: 'Aprobado',
  published: 'Publicado',
  replaced: 'Reemplazado',
} as const;
export type LegalTextStatus = keyof typeof LEGAL_TEXT_STATUSES;
export const legalTextStatusSchema = siteEnumOf(LEGAL_TEXT_STATUSES).describe('Estado del texto');

export const legalTextSchema = z.object({
  id: siteIdSchema,
  key: legalTextKeySchema,
  version_number: z.number().int().positive(),
  title: z.string(),
  body: z.string(),
  status: legalTextStatusSchema,
  drafted_by: siteRefSchema.nullable(),
  approved_by: siteRefSchema.nullable(),
  approved_at: siteDateTimeSchema.nullable(),
  concept_file_id: siteIdSchema.nullable().describe('Concepto del asesor jurídico'),
  effective_from: siteDateTimeSchema.nullable().describe('Fecha de publicación'),
  version: siteVersionSchema,
});
export const legalTextListResponseSchema = z.object({ data: z.array(legalTextSchema) });
export const legalTextQuerySchema = z.strictObject({ key: legalTextKeySchema.optional() });

export const createLegalTextSchema = z.strictObject({
  key: legalTextKeySchema,
  title: z.string().trim().min(5).max(160),
  body: siteBodySchema,
});
export const updateLegalTextSchema = createLegalTextSchema.omit({ key: true });
export const approveLegalTextSchema = z.strictObject({
  concept_file_id: siteIdSchema
    .nullable()
    .default(null)
    .describe('Concepto escrito del asesor jurídico (opcional)'),
});

/** Lo que ve cualquier visitante: solo la versión publicada. */
export const publicLegalTextSchema = z.object({
  id: siteIdSchema,
  key: legalTextKeySchema,
  title: z.string(),
  body: z.string(),
  version_number: z.number().int().positive(),
  effective_from: siteDateTimeSchema,
});

/** Términos de la plataforma de quien ingresa (decisión 3). */
export const platformTermsStatusSchema = z.object({
  pending: z.boolean().describe('Debe aceptar la versión vigente para continuar'),
  terms: publicLegalTextSchema.nullable().describe('Versión publicada; vacía si no hay'),
});
export const acceptPlatformTermsSchema = z.strictObject({
  text_id: siteIdSchema.describe('La versión que leyó y acepta'),
});

export type LegalText = z.infer<typeof legalTextSchema>;
export type CreateLegalText = z.infer<typeof createLegalTextSchema>;
export type UpdateLegalText = z.infer<typeof updateLegalTextSchema>;
export type ApproveLegalText = z.infer<typeof approveLegalTextSchema>;
export type PublicLegalText = z.infer<typeof publicLegalTextSchema>;
export type PlatformTermsStatus = z.infer<typeof platformTermsStatusSchema>;
export type AcceptPlatformTerms = z.infer<typeof acceptPlatformTermsSchema>;

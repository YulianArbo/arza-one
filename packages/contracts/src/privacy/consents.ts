import { z } from 'zod';

import { noticeKeySchema, purposeCodeSchema } from './notices.js';

// Contratos de las autorizaciones de tratamiento (Ley 1581 de 2012, art. 9; Decreto 1074 de 2015).
// Toda autorización guarda la versión exacta del texto aceptado, las finalidades, el canal, la
// fecha y la evidencia de quién la registró y desde dónde. No se borra: se revoca.

const dateTime = z.iso.datetime({ offset: true });
const calendarDate = z.iso.date().describe('Fecha de calendario AAAA-MM-DD');

/** Cómo se obtuvo la autorización. */
export const consentChannelSchema = z
  .enum(['written', 'digital', 'verbal', 'contract'])
  .describe(
    'Documento firmado, formulario o correo, verbal con constancia, o cláusula del contrato',
  );

export type ConsentChannel = z.infer<typeof consentChannelSchema>;

export const consentStatusSchema = z.enum(['active', 'revoked']).describe('Vigente o revocada');

export type ConsentStatus = z.infer<typeof consentStatusSchema>;

/**
 * Autorización que acompaña a un formulario con datos personales (componente reutilizable). La
 * casilla nunca viene marcada: sin «accepted» en verdadero el formulario no se guarda.
 */
export const consentGrantSchema = z.strictObject({
  notice_id: z.uuid().describe('Versión publicada del texto de autorización que se mostró'),
  accepted: z.literal(true, 'Marque la casilla de autorización para continuar.'),
  purposes: z
    .array(purposeCodeSchema)
    .min(1, 'Elija al menos una finalidad autorizada.')
    .max(20)
    .refine((codes) => new Set(codes).size === codes.length, 'Hay finalidades repetidas.'),
  channel: consentChannelSchema,
  granted_on: calendarDate.describe('Fecha en que el titular autorizó'),
  evidence_file_id: z
    .uuid()
    .nullable()
    .default(null)
    .describe('Soporte opcional: archivo ya revisado por el antivirus'),
});

export type ConsentGrant = z.infer<typeof consentGrantSchema>;

const noticeRefSchema = z.object({
  id: z.uuid(),
  key: noticeKeySchema,
  label: z.string(),
  version_number: z.number().int().positive(),
  title: z.string(),
});

/** Resumen que se muestra en la ficha del tercero; sin la evidencia técnica. */
export const partyConsentSchema = z.object({
  id: z.uuid(),
  notice: noticeRefSchema,
  purposes: z.array(z.string()),
  channel: consentChannelSchema,
  granted_on: calendarDate,
  status: consentStatusSchema,
  revoked_at: dateTime.nullable(),
});

export type PartyConsent = z.infer<typeof partyConsentSchema>;

/** Origen del registro: el formulario que lo tomó o el traslado de los datos anteriores. */
export const consentSourceSchema = z
  .enum(['party_create', 'party_consent', 'prior_record', 'crm_lead'])
  .describe(
    'Alta del tercero, autorización nueva en su ficha, registro anterior a B17 o prospecto del CRM (B22)',
  );

export const consentSchema = partyConsentSchema.extend({
  party: z.object({ id: z.uuid(), name: z.string().nullable() }),
  source: consentSourceSchema,
  evidence: z.object({
    recorded_by: z.string().nullable().describe('Quién la registró'),
    recorded_at: dateTime,
    ip_address: z.string().nullable(),
    user_agent: z.string().nullable(),
    file_id: z.uuid().nullable(),
  }),
  revocation_reason: z.string().nullable(),
});

export type Consent = z.infer<typeof consentSchema>;

export const consentListQuerySchema = z.strictObject({
  party_id: z.uuid().optional(),
  status: consentStatusSchema.optional(),
  notice_key: noticeKeySchema.optional(),
  limit: z.coerce.number().int().min(1).max(100).default(25),
  cursor: z.uuid().optional().describe('next_cursor de la página anterior'),
});

export type ConsentListQuery = z.infer<typeof consentListQuerySchema>;

export const consentListResponseSchema = z.object({
  data: z.array(consentSchema).describe('Las más recientes primero'),
  next_cursor: z.uuid().nullable(),
});

export type ConsentListResponse = z.infer<typeof consentListResponseSchema>;

export const revokeConsentRequestSchema = z.strictObject({
  reason: z.string().trim().min(5, 'Explique el motivo en al menos 5 caracteres.').max(500),
});

export type RevokeConsentRequest = z.infer<typeof revokeConsentRequestSchema>;

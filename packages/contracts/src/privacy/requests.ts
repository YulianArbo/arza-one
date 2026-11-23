import { z } from 'zod';

import { emailSchema } from '../iam/auth.js';
import { erasureResultSchema, personalDataExportSchema } from './personal-data.js';
import {
  identityMethodSchema,
  privacyRequestChannelSchema,
  privacyRequestClosureSchema,
  privacyRequestCodeSchema,
  privacyRequestEventKindSchema,
  privacyRequestKindSchema,
  privacyRequestStatusSchema,
  privacyRightSchema,
} from './request-rules.js';

// Solicitudes de los titulares de datos personales (M18, B42; ficha 17.19; Ley 1581 de 2012,
// arts. 8, 14 y 15). Recorrido: recibida → en verificación de identidad → en trámite → respondida →
// cerrada. El plazo se cuenta en días hábiles desde el día hábil siguiente a la recepción: consultas
// 10 días, prorrogables 5; reclamos 15, prorrogables 8 (decisiones 2 y 4).

const dateTime = z.iso.datetime({ offset: true });
const calendarDate = z.iso.date().describe('Fecha de calendario AAAA-MM-DD');
const versionField = z.number().int().positive().describe('Versión para la cabecera If-Match');

const nameSchema = z.string().trim().min(3, 'Escriba su nombre completo.').max(160);
const documentSchema = z
  .string()
  .trim()
  .regex(/^[A-Za-z0-9.-]{4,20}$/u, 'Escriba el número de documento, sin espacios.')
  .describe('Número de documento de identidad');
const phoneSchema = z
  .string()
  .trim()
  .regex(/^[+\d][\d\s-]{6,19}$/u, 'Escriba un teléfono de 7 a 20 números.')
  .nullable()
  .default(null);
const descriptionSchema = z
  .string()
  .trim()
  .min(10, 'Cuéntenos qué necesita (al menos 10 letras).')
  .max(8000);
const noteSchema = z.string().trim().min(5, 'Escriba al menos cinco letras.').max(2000);

// Sitio público y portal ------------------------------------------------------------------------

export const publicPrivacyRequestSchema = z.strictObject({
  right: privacyRightSchema,
  name: nameSchema,
  document_number: documentSchema,
  email: emailSchema.describe('Aquí llegan la constancia y la respuesta'),
  phone: phoneSchema,
  description: descriptionSchema,
  accepts_privacy: z.literal(true, {
    error: 'Para enviar la solicitud debe aceptar el tratamiento de sus datos.',
  }),
  /** Campo trampa: las personas no lo ven; los programas que llenan todo, sí. */
  website: z.literal('').default('').describe('Déjelo vacío'),
});

export type PublicPrivacyRequest = z.infer<typeof publicPrivacyRequestSchema>;

/** Desde el portal: el nombre y el correo los pone la cuenta del cliente. */
export const portalPrivacyRequestSchema = z.strictObject({
  right: privacyRightSchema,
  document_number: documentSchema,
  description: descriptionSchema,
});

export type PortalPrivacyRequest = z.infer<typeof portalPrivacyRequestSchema>;

export const privacyRequestReceiptSchema = z.object({
  code: z.string(),
  kind: privacyRequestKindSchema,
  received_at: dateTime,
  due_on: calendarDate.describe('Fecha límite de respuesta'),
});

export type PrivacyRequestReceipt = z.infer<typeof privacyRequestReceiptSchema>;

export const publicPrivacyStatusRequestSchema = z.strictObject({
  code: privacyRequestCodeSchema,
  email: emailSchema,
});

export type PublicPrivacyStatusRequest = z.infer<typeof publicPrivacyStatusRequestSchema>;

export const publicPrivacyStatusSchema = z.object({
  code: z.string(),
  right: privacyRightSchema,
  kind: privacyRequestKindSchema,
  status: privacyRequestStatusSchema,
  received_at: dateTime,
  due_on: calendarDate.nullable().describe('Vacío mientras el plazo está suspendido'),
  requirement: z.string().nullable().describe('Lo que falta para tramitar el reclamo'),
  responded_at: dateTime.nullable(),
  response: z.string().nullable(),
});

export type PublicPrivacyStatus = z.infer<typeof publicPrivacyStatusSchema>;

// Registro y recorrido internos -----------------------------------------------------------------

export const createPrivacyRequestSchema = z.strictObject({
  channel: z.enum(['email', 'phone', 'in_person', 'written']).describe('Por dónde llegó'),
  right: privacyRightSchema,
  requester_name: nameSchema,
  requester_email: emailSchema.nullable().default(null),
  requester_phone: phoneSchema,
  document_number: documentSchema.nullable().default(null),
  description: descriptionSchema,
  received_on: calendarDate.describe('Día en que llegó; nunca posterior a hoy'),
});

export type CreatePrivacyRequest = z.infer<typeof createPrivacyRequestSchema>;

export const verifyPrivacyRequestSchema = z.strictObject({
  party_id: z.uuid().describe('El titular registrado en Terceros'),
  method: identityMethodSchema,
  note: noteSchema.describe('Qué revisó para comprobar la identidad'),
});

export type VerifyPrivacyRequest = z.infer<typeof verifyPrivacyRequestSchema>;

export const privacyRequirementSchema = z.strictObject({
  text: noteSchema.describe('Qué le falta al reclamo; se le envía al titular'),
});

export type PrivacyRequirement = z.infer<typeof privacyRequirementSchema>;

export const privacyRequirementAnswerSchema = z.strictObject({
  note: noteSchema.describe('Lo que entregó el titular'),
  answered_on: calendarDate.describe('Día en que lo completó; nunca posterior a hoy'),
});

export type PrivacyRequirementAnswer = z.infer<typeof privacyRequirementAnswerSchema>;

export const privacyExtensionSchema = z.strictObject({
  reason: noteSchema.describe('Por qué se necesita más tiempo; se le informa al titular'),
});

export type PrivacyExtension = z.infer<typeof privacyExtensionSchema>;

export const privacyResponseSchema = z.strictObject({
  response: z.string().trim().min(20, 'La respuesta debe tener al menos 20 letras.').max(8000),
});

export type PrivacyResponse = z.infer<typeof privacyResponseSchema>;

export const privacyStartVerificationSchema = z.strictObject({});

export const privacyRequestListQuerySchema = z.object({
  status: privacyRequestStatusSchema.optional(),
  kind: privacyRequestKindSchema.optional(),
  party_id: z.uuid().optional(),
  limit: z.coerce.number().int().min(1).max(200).default(50),
  cursor: z.uuid().optional(),
});

export type PrivacyRequestListQuery = z.infer<typeof privacyRequestListQuerySchema>;

const personRefSchema = z.object({ id: z.uuid(), name: z.string().nullable() });

export const privacyRequestSummarySchema = z.object({
  id: z.uuid(),
  code: z.string(),
  right: privacyRightSchema,
  kind: privacyRequestKindSchema,
  channel: privacyRequestChannelSchema,
  status: privacyRequestStatusSchema,
  requester_name: z.string(),
  party: personRefSchema.nullable(),
  received_at: dateTime,
  due_on: calendarDate.nullable().describe('Vacío mientras el plazo está suspendido'),
  overdue: z.boolean(),
  extended: z.boolean(),
  paused: z.boolean().describe('Esperando que el titular complete el reclamo'),
  version: versionField,
});

export type PrivacyRequestSummary = z.infer<typeof privacyRequestSummarySchema>;

export const privacyRequestListResponseSchema = z.object({
  data: z.array(privacyRequestSummarySchema),
  next_cursor: z.uuid().nullable(),
});

export type PrivacyRequestListResponse = z.infer<typeof privacyRequestListResponseSchema>;

export const privacyRequestEventSchema = z.object({
  kind: privacyRequestEventKindSchema,
  note: z.string().nullable(),
  actor: z.string().nullable().describe('Quién lo hizo; vacío si fue el sistema'),
  occurred_at: dateTime,
  mailed_at: dateTime.nullable().describe('Cuándo se le envió al titular'),
});

export const privacyRequestSchema = privacyRequestSummarySchema.extend({
  requester_email: z.string().nullable(),
  requester_phone: z.string().nullable(),
  document_number: z.string().nullable(),
  description: z.string(),
  source_code: z.string().nullable().describe('Radicado de la PQRSF de origen'),
  verification: z
    .object({
      method: identityMethodSchema,
      note: z.string(),
      verified_at: dateTime,
      verified_by: z.string().nullable(),
    })
    .nullable(),
  requirement: z
    .object({ text: z.string(), sent_at: dateTime, answered_at: dateTime.nullable() })
    .nullable(),
  extension_reason: z.string().nullable(),
  requirement_open_until: calendarDate
    .nullable()
    .describe('Último día para pedir que complete el reclamo; vacío si es consulta'),
  response: z.string().nullable(),
  responded_at: dateTime.nullable(),
  closure: privacyRequestClosureSchema.nullable(),
  closed_at: dateTime.nullable(),
  exports: z.array(personalDataExportSchema),
  erasure: erasureResultSchema.nullable(),
  events: z.array(privacyRequestEventSchema),
});

export type PrivacyRequest = z.infer<typeof privacyRequestSchema>;

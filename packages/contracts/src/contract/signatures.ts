import { z } from 'zod';

import { calendarDateSchema, dateTimeSchema, versionSchema } from '../crm/common.js';
import { optionalText, requiredText } from './common.js';

// Firma electrónica (B25, capítulo 19, ficha 17.7): el nivel 2, con enlace único y código al correo.
// Un contrato o un otrosí aprobado se envía a firma: firman primero las personas autorizadas del
// cliente, una tras otra, y de última la empresa. Cuando firman todos, el documento firmado lleva una
// página final de firmas y el certificado de evidencia, y cualquiera lo puede verificar.

/** Códigos estables de los errores de la firma (numeral 14.2). */
export const SIGNATURE_ERROR_CODES = {
  notFound: 'SIGNATURE_NOT_FOUND',
  statusInvalid: 'SIGNATURE_STATUS_INVALID',
  signersInvalid: 'SIGNATURE_SIGNERS_INVALID',
  partyNotVerified: 'SIGNATURE_PARTY_NOT_VERIFIED',
  linkInvalid: 'SIGNATURE_LINK_INVALID',
  codeInvalid: 'SIGNATURE_CODE_INVALID',
  codeExpired: 'SIGNATURE_CODE_EXPIRED',
  codeLocked: 'SIGNATURE_CODE_LOCKED',
  codeTooSoon: 'SIGNATURE_CODE_TOO_SOON',
  notYourTurn: 'SIGNATURE_NOT_YOUR_TURN',
  datesInvalid: 'SIGNATURE_DATES_INVALID',
} as const;

/** El texto exacto que acepta quien firma (numeral 19.2). Queda igual en el certificado. */
export const ACCEPTANCE_TEXT =
  'He leído y acepto el contenido de este documento y lo firmo electrónicamente.';

/** Reglas del código y del enlace (numeral 19.2, decisiones 8 y 11 del B25). */
export const SIGNATURE_RULES = {
  codeDigits: 6,
  codeMinutes: 10,
  codeAttempts: 5,
  /** Espera mínima entre dos códigos, para que nadie llene el correo de la persona. */
  codeIntervalSeconds: 60,
  /** Lo que dura la confirmación del código para leer y firmar. */
  ticketMinutes: 30,
  defaultDays: 15,
  maxDays: 30,
  reminderEveryDays: 3,
  maxReminders: 3,
  copyDays: 30,
} as const;

export const ENVELOPE_STATUSES = {
  draft: 'En preparación',
  sent: 'En firma',
  completed: 'Firmado',
  rejected: 'Rechazado',
  expired: 'Vencido',
  cancelled: 'Anulado',
} as const;

export type EnvelopeStatus = keyof typeof ENVELOPE_STATUSES;

export const envelopeStatusSchema = z
  .enum(Object.keys(ENVELOPE_STATUSES) as [EnvelopeStatus, ...EnvelopeStatus[]])
  .describe('Estado del proceso de firma');

/** Estados en que el proceso sigue abierto: no puede haber otro para el mismo documento. */
export const OPEN_ENVELOPE_STATUSES: readonly EnvelopeStatus[] = ['draft', 'sent'];

export const SIGNER_STATUSES = {
  waiting: 'En espera de su turno',
  pending: 'Por firmar',
  signed: 'Firmó',
  rejected: 'Rechazó',
} as const;

export type SignerStatus = keyof typeof SIGNER_STATUSES;

export const signerStatusSchema = z
  .enum(Object.keys(SIGNER_STATUSES) as [SignerStatus, ...SignerStatus[]])
  .describe('Estado del firmante');

export const SIGNER_KINDS = { client: 'Por el cliente', company: 'Por la empresa' } as const;

export type SignerKind = keyof typeof SIGNER_KINDS;

export const signerKindSchema = z.enum(['client', 'company']).describe('Por quién firma');

export const SIGNATURE_METHODS = {
  email_code: 'Enlace único y código de un solo uso enviado a su correo',
  session_mfa: 'Sesión en ARZA ONE con contraseña y segundo factor',
} as const;

export type SignatureMethod = keyof typeof SIGNATURE_METHODS;

export const signatureMethodSchema = z.enum(['email_code', 'session_mfa']);

export const SIGNATURE_SOURCES = { contract: 'Contrato', amendment: 'Otrosí o prórroga' } as const;

export type SignatureSource = keyof typeof SIGNATURE_SOURCES;

export const signatureSourceSchema = z
  .enum(['contract', 'amendment'])
  .describe('El documento que se firma');

/** La cadena de eventos (numeral 19.3), con el nombre que ve la persona. */
export const SIGNATURE_EVENTS = {
  created: 'Proceso preparado',
  sent: 'Enviado a firma',
  invited: 'Enlace enviado al correo',
  reminded: 'Recordatorio enviado',
  opened: 'Abrió el enlace',
  code_sent: 'Código enviado al correo',
  code_verified: 'Código validado',
  code_failed: 'Código equivocado',
  code_locked: 'Código bloqueado por intentos',
  viewed: 'Leyó el documento',
  downloaded: 'Descargó el documento',
  signed: 'Firmó',
  rejected: 'Rechazó',
  cancelled: 'Proceso anulado',
  expired: 'Proceso vencido',
  completed: 'Firmado por todos',
  sealed: 'Documento firmado y certificado generados',
  copy_sent: 'Copia enviada al correo',
} as const;

export type SignatureEventType = keyof typeof SIGNATURE_EVENTS;

export const signatureEventTypeSchema = z.enum(
  Object.keys(SIGNATURE_EVENTS) as [SignatureEventType, ...SignatureEventType[]],
);

export const sha256Schema = z
  .string()
  .regex(/^[0-9a-f]{64}$/u)
  .describe('Huella SHA-256 en hexadecimal');

// --- Preparar y enviar (equipo, con sesión) -------------------------------------------------

export const envelopeOptionsQuerySchema = z.strictObject({
  source: signatureSourceSchema,
  source_id: z.uuid(),
});

const signerOptionSchema = z.object({
  person_id: z.uuid().nullable().describe('La persona en Terceros; null si la cuenta no la tiene'),
  name: z.string(),
  email: z.string().nullable(),
  id_number: z.string().nullable(),
  /** Le falta el correo o el documento: no puede firmar hasta completarlos en Terceros. */
  ready: z.boolean(),
});

export const envelopeOptionsSchema = z.object({
  document: z.object({ code: z.string(), title: z.string(), sha256: z.string().nullable() }),
  party: z.object({ id: z.uuid(), name: z.string() }),
  /** El conocimiento del tercero está aprobado (numeral 19.4). */
  party_verified: z.boolean(),
  client_signers: z.array(signerOptionSchema).describe('Firmantes autorizados del cliente'),
  company_signers: z
    .array(signerOptionSchema.extend({ user_id: z.uuid() }))
    .describe('Personas de la Dirección que pueden firmar por la empresa'),
  default_expires_on: calendarDateSchema,
  max_expires_on: calendarDateSchema,
});

export const createEnvelopeRequestSchema = z.strictObject({
  source: signatureSourceSchema,
  source_id: z.uuid(),
  client_signer_ids: z
    .array(z.uuid())
    .min(1, 'Elija al menos una persona que firme por el cliente.')
    .max(5, 'Pueden firmar a lo sumo cinco personas por el cliente.')
    .describe('Firmantes del cliente, en el orden en que firman'),
  company_signer_id: z
    .uuid()
    .describe('Usuario de la Dirección que firma por la empresa, de último'),
  expires_on: calendarDateSchema.describe('Último día para firmar'),
  message: optionalText(1000).describe('Mensaje para los firmantes; opcional'),
});

export const sendEnvelopeRequestSchema = z.strictObject({});

export const cancelEnvelopeRequestSchema = z.strictObject({
  reason: requiredText(3, 1000, 'Escriba por qué anula el proceso de firma.'),
});

export const signAsCompanyRequestSchema = z.strictObject({
  accept: z.literal(true, 'Marque la casilla para firmar.'),
});

export const rejectSignatureRequestSchema = z.strictObject({
  reason: requiredText(3, 1000, 'Escriba por qué rechaza el documento.'),
});

export const envelopeDocumentSchema = z
  .enum(['original', 'signed', 'certificate'])
  .describe('El PDF que se envió, el firmado o el certificado de evidencia');

export const envelopeDocumentRequestSchema = z.strictObject({ document: envelopeDocumentSchema });

export const envelopeListQuerySchema = z.strictObject({
  source: signatureSourceSchema,
  source_id: z.uuid(),
});

export const envelopeSignerSchema = z.object({
  id: z.uuid(),
  kind: signerKindSchema,
  sign_order: z.number().int().positive(),
  name: z.string(),
  email: z.string(),
  id_number: z.string(),
  role: z.string(),
  status: signerStatusSchema,
  method: signatureMethodSchema.nullable(),
  opened_at: dateTimeSchema.nullable(),
  signed_at: dateTimeSchema.nullable(),
  rejected_at: dateTimeSchema.nullable(),
  reject_reason: z.string().nullable(),
  reminders: z.number().int().nonnegative(),
  code_locked: z.boolean(),
  /** Es la persona con sesión y le toca firmar por la empresa. */
  is_me: z.boolean(),
});

export const signatureEventSchema = z.object({
  id: z.uuid(),
  type: signatureEventTypeSchema,
  signer_name: z.string().nullable(),
  occurred_at: dateTimeSchema,
  ip: z.string().nullable(),
  user_agent: z.string().nullable(),
  hash: sha256Schema,
});

export const envelopeSchema = z.object({
  id: z.uuid(),
  code: z.string().describe('FE-AAAA-NNNN'),
  source: signatureSourceSchema,
  document: z.object({
    id: z.uuid(),
    code: z.string(),
    title: z.string(),
    sha256: sha256Schema.describe('Huella del PDF aprobado que se envió a firma'),
  }),
  status: envelopeStatusSchema,
  message: z.string().nullable(),
  expires_at: dateTimeSchema,
  sent_at: dateTimeSchema.nullable(),
  completed_at: dateTimeSchema.nullable(),
  closed_reason: z.string().nullable(),
  signed: z
    .object({
      status: z.enum(['pending', 'ready']),
      sha256: sha256Schema.nullable(),
      verification_code: z.string(),
    })
    .nullable(),
  signers: z.array(envelopeSignerSchema),
  events: z.array(signatureEventSchema),
  /** La cadena de eventos está completa y ningún eslabón cambió. */
  chain_intact: z.boolean(),
  created_at: dateTimeSchema,
  version: versionSchema,
});

export const envelopeListResponseSchema = z.object({ items: z.array(envelopeSchema) });

export type EnvelopeOptionsQuery = z.infer<typeof envelopeOptionsQuerySchema>;
export type EnvelopeOptions = z.infer<typeof envelopeOptionsSchema>;
export type CreateEnvelopeRequest = z.infer<typeof createEnvelopeRequestSchema>;
export type CancelEnvelopeRequest = z.infer<typeof cancelEnvelopeRequestSchema>;
export type SignAsCompanyRequest = z.infer<typeof signAsCompanyRequestSchema>;
export type RejectSignatureRequest = z.infer<typeof rejectSignatureRequestSchema>;
export type EnvelopeDocument = z.infer<typeof envelopeDocumentSchema>;
export type EnvelopeDocumentRequest = z.infer<typeof envelopeDocumentRequestSchema>;
export type EnvelopeListQuery = z.infer<typeof envelopeListQuerySchema>;
export type EnvelopeSigner = z.infer<typeof envelopeSignerSchema>;
export type SignatureEvent = z.infer<typeof signatureEventSchema>;
export type Envelope = z.infer<typeof envelopeSchema>;
export type EnvelopeListResponse = z.infer<typeof envelopeListResponseSchema>;

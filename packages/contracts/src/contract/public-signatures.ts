import { z } from 'zod';

import { dateTimeSchema } from '../crm/common.js';
import { requiredText } from './common.js';
import { ACCEPTANCE_TEXT, sha256Schema } from './signatures.js';

// Firma electrónica sin sesión (B25, capítulo 19): la página de firma a la que llega quien firma por
// el cliente desde su correo, y la verificación pública de un documento firmado.

// --- Página de firma (sin sesión) -----------------------------------------------------------

/** La llave del enlace va en el cuerpo, nunca en la dirección: no queda en los registros. */
export const signatureLinkTokenSchema = z
  .string()
  .trim()
  .regex(/^[A-Za-z0-9_-]{32,128}$/u, 'El enlace no es válido.');

const ticketSchema = z
  .string()
  .trim()
  .regex(/^[A-Za-z0-9_-]{32,128}$/u, 'Vuelva a escribir el código.');

export const publicSignatureRequestSchema = z.strictObject({ token: signatureLinkTokenSchema });

export const verifySignatureCodeRequestSchema = z.strictObject({
  token: signatureLinkTokenSchema,
  code: z
    .string()
    .trim()
    .regex(/^[0-9]{6}$/u, 'Escriba los seis números del código.'),
});

export const verifySignatureCodeResponseSchema = z.object({
  ticket: z.string().describe('Confirmación del código; vale 30 minutos para leer y firmar'),
  expires_at: dateTimeSchema,
});

export const publicSignatureDocumentRequestSchema = z.strictObject({
  token: signatureLinkTokenSchema,
  ticket: ticketSchema.optional().describe('Hace falta para el documento por firmar'),
  document: z.enum(['original', 'signed']),
  disposition: z
    .enum(['inline', 'attachment'])
    .default('inline')
    .describe('Para leerlo en la página o para guardarlo'),
});

export const publicSignRequestSchema = z.strictObject({
  token: signatureLinkTokenSchema,
  ticket: ticketSchema,
  accept: z.literal(true, 'Marque la casilla para firmar.'),
});

export const publicRejectRequestSchema = z.strictObject({
  token: signatureLinkTokenSchema,
  ticket: ticketSchema,
  reason: requiredText(3, 1000, 'Escriba por qué rechaza el documento.'),
});

export const PUBLIC_SIGNATURE_STATES = {
  pending: 'Le corresponde firmar',
  waiting: 'Todavía no es su turno',
  signed: 'Usted ya firmó',
  rejected: 'Usted rechazó el documento',
  completed: 'Firmado por todos',
  closed: 'El proceso de firma se cerró',
} as const;

export type PublicSignatureState = keyof typeof PUBLIC_SIGNATURE_STATES;

export const publicSignatureStateSchema = z.enum(
  Object.keys(PUBLIC_SIGNATURE_STATES) as [PublicSignatureState, ...PublicSignatureState[]],
);

export const publicSignatureSchema = z.object({
  company: z.object({ name: z.string(), tax_id: z.string() }),
  document: z.object({
    code: z.string(),
    title: z.string(),
    kind: z.string().describe('Contrato, orden de servicio, otrosí…'),
    sha256: sha256Schema,
  }),
  signer: z.object({
    name: z.string(),
    id_number: z.string(),
    role: z.string(),
    email_hint: z.string().describe('El correo, con parte oculta: a***@dominio.com'),
  }),
  state: publicSignatureStateSchema,
  /** Ya validó el código y la confirmación sigue vigente. */
  acceptance_text: z.literal(ACCEPTANCE_TEXT),
  expires_at: dateTimeSchema,
  signed_at: dateTimeSchema.nullable(),
  code_locked: z.boolean(),
  signed_copy: z.boolean().describe('El documento firmado está listo para descargar'),
});

// --- Verificación pública ----------------------------------------------------------------------

export const verificationCodeSchema = z
  .string()
  .trim()
  .toUpperCase()
  .regex(/^[A-Z0-9]{4}-[A-Z0-9]{4}-[A-Z0-9]{4}$/u, 'El código tiene la forma XXXX-XXXX-XXXX.');

export const verifyDocumentRequestSchema = z
  .strictObject({
    code: verificationCodeSchema.optional(),
    sha256: sha256Schema.optional().describe('Huella del archivo, calculada en su computador'),
  })
  .refine((value) => value.code !== undefined || value.sha256 !== undefined, {
    message: 'Escriba el código o cargue el archivo.',
  });

export const VERIFICATION_RESULTS = {
  valid: 'El documento es auténtico: coincide con el original firmado',
  mismatch: 'El archivo NO coincide con el documento firmado de ese código',
  not_found: 'No encontramos un documento firmado con esos datos',
} as const;

export type VerificationResult = keyof typeof VERIFICATION_RESULTS;

export const verificationResultSchema = z.enum(['valid', 'mismatch', 'not_found']);

export const verifyDocumentResponseSchema = z.object({
  result: verificationResultSchema,
  document: z
    .object({
      code: z.string().describe('Código del documento, como CTR-2026-0001'),
      company: z.string(),
      completed_at: dateTimeSchema,
      signatures: z.number().int().positive(),
      verification_code: z.string(),
    })
    .nullable()
    .describe('Solo si el código o la huella existen; nunca el contenido ni los nombres'),
});

export type PublicSignatureRequest = z.infer<typeof publicSignatureRequestSchema>;
export type VerifySignatureCodeRequest = z.infer<typeof verifySignatureCodeRequestSchema>;
export type VerifySignatureCodeResponse = z.infer<typeof verifySignatureCodeResponseSchema>;
export type PublicSignatureDocumentRequest = z.infer<typeof publicSignatureDocumentRequestSchema>;
export type PublicSignRequest = z.infer<typeof publicSignRequestSchema>;
export type PublicRejectRequest = z.infer<typeof publicRejectRequestSchema>;
export type PublicSignature = z.infer<typeof publicSignatureSchema>;
export type VerifyDocumentRequest = z.infer<typeof verifyDocumentRequestSchema>;
export type VerifyDocumentResponse = z.infer<typeof verifyDocumentResponseSchema>;

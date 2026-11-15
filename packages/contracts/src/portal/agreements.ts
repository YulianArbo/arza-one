import { z } from 'zod';

import { contractKindSchema, contractStatusSchema } from '../contract/common.js';
import { envelopeStatusSchema } from '../contract/signatures.js';
import { calendarDateSchema, dateTimeSchema, moneySchema } from '../crm/common.js';

// Contratos y firmas en el portal (B30, decisiones 4 y 6). Los contratos se ven desde que se envían
// a firma, nunca en borrador. Firmar desde el portal genera un enlace nuevo de un solo uso hacia la
// misma pantalla de firma de siempre, que pide el código enviado al correo.

/** Qué se firma: un contrato, un otrosí o el acta de entrega de un entregable. */
export const portalSignableKindSchema = z.enum(['contract', 'amendment', 'acceptance']);

export type PortalSignableKind = z.infer<typeof portalSignableKindSchema>;

export const PORTAL_SIGNABLE_LABELS: Readonly<Record<PortalSignableKind, string>> = {
  contract: 'Contrato',
  amendment: 'Otrosí',
  acceptance: 'Acta de entrega',
};

export const portalSignatureSchema = z.object({
  id: z.uuid().describe('Proceso de firma'),
  code: z.string(),
  kind: portalSignableKindSchema,
  document_code: z.string(),
  document_title: z.string(),
  status: envelopeStatusSchema,
  sent_at: dateTimeSchema.nullable(),
  expires_at: dateTimeSchema,
  completed_at: dateTimeSchema.nullable(),
  signed: z.number().int().describe('Firmas ya puestas'),
  signers: z.number().int().describe('Firmas en total'),
  my_turn: z.boolean().describe('Le toca firmar a usted, con el correo de su cuenta'),
  can_sign: z.boolean().describe('Le toca y su rol le permite firmar este documento'),
});

export const portalSignatureListSchema = z.object({
  pending: z.array(portalSignatureSchema).describe('En firma: esperan una firma'),
  recent: z.array(portalSignatureSchema).describe('Terminados en los últimos 90 días'),
});

export const portalSigningLinkSchema = z.object({
  url: z.string().describe('Dirección de la pantalla de firma, con la llave de un solo uso'),
});

export const portalContractSchema = z.object({
  id: z.uuid(),
  code: z.string(),
  kind: contractKindSchema,
  title: z.string(),
  status: contractStatusSchema,
  value: moneySchema.nullable(),
  starts_on: calendarDateSchema,
  ends_on: calendarDateSchema,
  signed_on: calendarDateSchema.nullable(),
  has_signed_copy: z.boolean(),
});

export const portalContractListSchema = z.object({ data: z.array(portalContractSchema) });

export type PortalSignature = z.infer<typeof portalSignatureSchema>;
export type PortalSignatureList = z.infer<typeof portalSignatureListSchema>;
export type PortalSigningLink = z.infer<typeof portalSigningLinkSchema>;
export type PortalContract = z.infer<typeof portalContractSchema>;
export type PortalContractList = z.infer<typeof portalContractListSchema>;

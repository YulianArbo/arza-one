import { z } from 'zod';

import { taxKeySchema, taxRateSchema } from '../finance/tax-parameters.js';
import {
  calendarDateSchema,
  dateTimeSchema,
  listLimitSchema,
  moneySchema,
  personRefSchema,
  versionSchema,
} from './common.js';
import { serviceSchema, serviceUnitSchema } from './services.js';

// Cotizaciones (B23, ficha 17.6): borrador → en aprobación → aprobada → enviada → aceptada,
// rechazada o vencida. «Aprobada» y «Reemplazada» las agregó el dueño del producto: solo se envía
// una cotización aprobada (anexo D) y una enviada no se edita, se crea una versión nueva que
// reemplaza a la anterior. No se acepta una cotización vencida.

export const QUOTE_STATUSES = {
  draft: 'Borrador',
  in_approval: 'En aprobación',
  approved: 'Aprobada',
  sent: 'Enviada',
  accepted: 'Aceptada',
  rejected: 'Rechazada',
  expired: 'Vencida',
  superseded: 'Reemplazada',
} as const;

export type QuoteStatus = keyof typeof QUOTE_STATUSES;

export const quoteStatusSchema = z
  .enum(Object.keys(QUOTE_STATUSES) as [QuoteStatus, ...QuoteStatus[]])
  .describe('Estado de la cotización');

/** Estados desde los que se puede crear la versión siguiente. */
export const NEW_VERSION_FROM: readonly QuoteStatus[] = ['sent', 'rejected', 'expired'];

/** Días de vigencia que el asistente propone. */
export const DEFAULT_QUOTE_VALID_DAYS = 30;

/** Cantidad con hasta dos decimales, mayor que cero, como «1.5» horas. */
export const quantitySchema = z
  .string()
  .trim()
  .regex(/^\d{1,7}(\.\d{1,2})?$/u, 'Escriba la cantidad con punto decimal: 1.5')
  .refine((value) => Number(value) > 0, 'La cantidad debe ser mayor que cero.')
  .describe('Cantidad, con hasta dos decimales');

/** Descuento de la línea en porcentaje, de 0 a 100. */
export const discountPercentSchema = z
  .string()
  .trim()
  .regex(/^\d{1,3}(\.\d{1,2})?$/u, 'Escriba el descuento en porcentaje: 7.5')
  .refine((value) => Number(value) <= 100, 'El descuento no puede pasar de 100 %.')
  .describe('Descuento en porcentaje');

function optionalText(max: number) {
  return z
    .string()
    .trim()
    .min(3, 'Escriba al menos tres letras.')
    .max(max)
    .nullable()
    .default(null);
}

export const quoteItemRequestSchema = z.strictObject({
  service_id: z
    .uuid()
    .nullable()
    .default(null)
    .describe('Servicio del portafolio; vacío si es libre'),
  description: z.string().trim().min(3, 'Escriba al menos tres letras.').max(500),
  unit: serviceUnitSchema,
  quantity: quantitySchema,
  unit_price: moneySchema.describe('Precio unitario en pesos, antes de impuestos'),
  discount_percent: discountPercentSchema.default('0'),
  tax_key: taxKeySchema.describe('Impuesto que aplica; se usa la tarifa vigente'),
});

export const quoteConditionsSchema = z.strictObject({
  payment_terms: z.string().trim().min(3, 'Escriba la forma de pago.').max(500),
  delivery_terms: z.string().trim().min(3, 'Escriba el plazo de entrega.').max(500),
  warranty: optionalText(500).describe('Garantía; vacío si no aplica'),
});

const quoteDraftFields = {
  valid_until: calendarDateSchema.describe('Último día en que el cliente puede aceptarla'),
  conditions: quoteConditionsSchema,
  notes: optionalText(2000).describe('Notas para el cliente'),
  items: z
    .array(quoteItemRequestSchema)
    .min(1, 'Agregue al menos un ítem.')
    .max(100, 'Una cotización tiene como máximo 100 ítems.'),
};

export const createQuoteRequestSchema = z.strictObject({
  opportunity_id: z.uuid().describe('Oportunidad abierta del embudo'),
  ...quoteDraftFields,
});

/** Guarda el borrador completo: encabezado e ítems juntos, para que nunca quede a medias. */
export const updateQuoteRequestSchema = z.strictObject(quoteDraftFields);

export const returnQuoteRequestSchema = z.strictObject({
  comment: z.string().trim().min(3, 'Escriba qué debe corregirse.').max(2000),
});

export const approveQuoteRequestSchema = z.strictObject({
  comment: optionalText(2000),
});

export const sendQuoteRequestSchema = z.strictObject({
  recipient_name: z.string().trim().min(3, 'Escriba el nombre de quien la recibe.').max(160),
  recipient_email: z.email('Escriba un correo válido.').trim().toLowerCase().max(254),
});

export const quoteItemSchema = z.object({
  id: z.uuid(),
  position: z.number().int().positive(),
  service: z.object({ id: z.uuid(), code: z.string() }).nullable(),
  description: z.string(),
  unit: serviceUnitSchema,
  quantity: z.string(),
  unit_price: moneySchema,
  discount_percent: z.string(),
  tax_key: taxKeySchema,
  tax_rate: taxRateSchema.describe('Tarifa usada, guardada al calcular'),
  line_subtotal: moneySchema,
  line_discount: moneySchema,
  line_tax: moneySchema,
  line_total: moneySchema,
});

export const quoteTaxLineSchema = z.object({
  tax_rate: z.string(),
  base: moneySchema,
  tax: moneySchema,
});

const codeRef = z.object({ id: z.uuid(), code: z.string() });

export const quoteSummarySchema = z.object({
  id: z.uuid(),
  code: z.string().describe('COT-AAAA-NNNN'),
  version_number: z.number().int().positive().describe('Versión de la cotización: 1, 2, 3…'),
  opportunity: codeRef.extend({ title: z.string() }),
  party: personRefSchema.describe('Cliente'),
  status: quoteStatusSchema,
  valid_until: calendarDateSchema,
  total: moneySchema,
  author: personRefSchema.nullable(),
  sent_at: dateTimeSchema.nullable(),
  created_at: dateTimeSchema,
  version: versionSchema,
});

export const quoteApprovalSchema = z.object({
  required: z.boolean().describe('Algún descuento pasa el tope'),
  largest_discount: z.string(),
  discount_cap: z.string().nullable().describe('Tope vigente al pedir el envío'),
  decided_by: personRefSchema.nullable(),
  decided_at: dateTimeSchema.nullable(),
  note: z.string().nullable().describe('Comentario de quien aprobó o devolvió'),
});

export const quoteResponseSchema = z.object({
  decision: z.enum(['accepted', 'rejected']),
  at: dateTimeSchema,
  by_name: z.string().nullable(),
  reason: z.string().nullable(),
  ip: z.string().nullable(),
  user_agent: z.string().nullable(),
  pdf_sha256: z.string().nullable().describe('Huella del PDF que vio el cliente'),
});

export const quoteDetailSchema = quoteSummarySchema.extend({
  conditions: quoteConditionsSchema,
  notes: z.string().nullable(),
  items: z.array(quoteItemSchema),
  subtotal: moneySchema,
  discount_total: moneySchema,
  tax_total: moneySchema,
  taxes: z.array(quoteTaxLineSchema),
  approval: quoteApprovalSchema,
  recipient: z.object({ name: z.string(), email: z.string() }).nullable(),
  email_sent_at: dateTimeSchema.nullable().describe('Cuando salió el correo con el enlace'),
  response: quoteResponseSchema.nullable(),
  pdf: z.object({
    status: z.enum(['none', 'pending', 'ready']),
    file_name: z.string().nullable(),
  }),
  party_email: z.string().nullable().describe('Correo del cliente en Terceros, para el envío'),
  versions: z.array(
    z.object({
      id: z.uuid(),
      version_number: z.number().int().positive(),
      status: quoteStatusSchema,
      total: moneySchema,
      created_at: dateTimeSchema,
    }),
  ),
});

export const quoteListQuerySchema = z.strictObject({
  status: quoteStatusSchema.optional(),
  opportunity_id: z.uuid().optional(),
  view: z.enum(['latest', 'all']).default('latest').describe('Solo la última versión o todas'),
  q: z.string().trim().min(1).max(120).optional().describe('Busca en código y cliente'),
  limit: listLimitSchema,
  cursor: z.uuid().optional(),
});

export const quoteListResponseSchema = z.object({
  data: z.array(quoteSummarySchema),
  next_cursor: z.uuid().nullable(),
});

/** Lo que necesita el asistente: servicios activos, impuestos vigentes y el tope de descuento. */
export const quoteOptionsSchema = z.object({
  services: z.array(serviceSchema),
  taxes: z.array(z.object({ key: taxKeySchema, label: z.string(), rate: taxRateSchema })),
  discount_cap: z.string().nullable().describe('Tope de descuento sin aprobación, en %'),
  default_valid_days: z.number().int().positive(),
});

// --- Enlace público del cliente (sin sesión) -----------------------------------------------

/** La llave del enlace va en el cuerpo, nunca en la dirección: no queda en los registros. */
export const quoteLinkTokenSchema = z
  .string()
  .trim()
  .regex(/^[A-Za-z0-9_-]{32,128}$/u, 'El enlace no es válido.');

export const publicQuoteRequestSchema = z.strictObject({ token: quoteLinkTokenSchema });

export const acceptQuoteRequestSchema = z.strictObject({
  token: quoteLinkTokenSchema,
  accepted_by_name: z.string().trim().min(3, 'Escriba su nombre completo.').max(160),
  accept: z.literal(true, 'Marque la casilla para aceptar la cotización.'),
});

export const rejectQuoteRequestSchema = z.strictObject({
  token: quoteLinkTokenSchema,
  reason: optionalText(1000).describe('Por qué la rechaza; opcional'),
});

export const PUBLIC_QUOTE_STATES = {
  open: 'Puede aceptarla o rechazarla',
  accepted: 'Aceptada',
  rejected: 'Rechazada',
  expired: 'Vencida',
  replaced: 'Reemplazada por una versión nueva',
} as const;

export type PublicQuoteState = keyof typeof PUBLIC_QUOTE_STATES;

export const publicQuoteStateSchema = z.enum(
  Object.keys(PUBLIC_QUOTE_STATES) as [PublicQuoteState, ...PublicQuoteState[]],
);

export const publicQuoteSchema = z.object({
  company: z.object({ name: z.string(), tax_id: z.string().nullable() }),
  code: z.string(),
  version_number: z.number().int().positive(),
  party_name: z.string(),
  issued_at: dateTimeSchema.describe('Cuando se envió'),
  valid_until: calendarDateSchema,
  state: publicQuoteStateSchema,
  conditions: quoteConditionsSchema,
  notes: z.string().nullable(),
  items: z.array(
    quoteItemSchema.pick({
      position: true,
      description: true,
      unit: true,
      quantity: true,
      unit_price: true,
      discount_percent: true,
      tax_rate: true,
      line_total: true,
    }),
  ),
  subtotal: moneySchema,
  discount_total: moneySchema,
  tax_total: moneySchema,
  total: moneySchema,
  taxes: z.array(quoteTaxLineSchema),
  responded_at: dateTimeSchema.nullable(),
  responded_by: z.string().nullable(),
});

export type QuoteItemRequest = z.infer<typeof quoteItemRequestSchema>;
export type QuoteConditions = z.infer<typeof quoteConditionsSchema>;
export type CreateQuoteRequest = z.infer<typeof createQuoteRequestSchema>;
export type UpdateQuoteRequest = z.infer<typeof updateQuoteRequestSchema>;
export type ReturnQuoteRequest = z.infer<typeof returnQuoteRequestSchema>;
export type ApproveQuoteRequest = z.infer<typeof approveQuoteRequestSchema>;
export type SendQuoteRequest = z.infer<typeof sendQuoteRequestSchema>;
export type QuoteItem = z.infer<typeof quoteItemSchema>;
export type QuoteSummary = z.infer<typeof quoteSummarySchema>;
export type QuoteDetail = z.infer<typeof quoteDetailSchema>;
export type QuoteListQuery = z.infer<typeof quoteListQuerySchema>;
export type QuoteListResponse = z.infer<typeof quoteListResponseSchema>;
export type QuoteOptions = z.infer<typeof quoteOptionsSchema>;
export type PublicQuoteRequest = z.infer<typeof publicQuoteRequestSchema>;
export type AcceptQuoteRequest = z.infer<typeof acceptQuoteRequestSchema>;
export type RejectQuoteRequest = z.infer<typeof rejectQuoteRequestSchema>;
export type PublicQuote = z.infer<typeof publicQuoteSchema>;

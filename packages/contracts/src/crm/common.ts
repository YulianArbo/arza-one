import { z } from 'zod';

// Piezas comunes del CRM (M05, B22; ficha 17.6): códigos de error, dinero, fechas y referencias.

/** Códigos estables de los errores del CRM (numeral 14.2). */
export const CRM_ERROR_CODES = {
  notFound: 'CRM_NOT_FOUND',
  catalogValueInvalid: 'CRM_CATALOG_VALUE_INVALID',
  statusInvalid: 'CRM_STATUS_INVALID',
  partyInvalid: 'CRM_PARTY_INVALID',
  ownerInvalid: 'CRM_OWNER_INVALID',
  documentRequired: 'CRM_DOCUMENT_REQUIRED',
  campaignInvalid: 'CRM_CAMPAIGN_INVALID',
  campaignDuplicate: 'CRM_CAMPAIGN_DUPLICATE',
  serviceDuplicate: 'CRM_SERVICE_DUPLICATE',
  serviceInvalid: 'CRM_SERVICE_INVALID',
  taxInvalid: 'CRM_TAX_INVALID',
  validUntilInvalid: 'CRM_VALID_UNTIL_INVALID',
  selfApproval: 'CRM_SELF_APPROVAL',
  pdfNotReady: 'CRM_QUOTE_PDF_NOT_READY',
  quoteLinkInvalid: 'CRM_QUOTE_LINK_INVALID',
  /** Nombre del numeral 14.2. */
  quoteExpired: 'QUOTE_EXPIRED',
} as const;

export const calendarDateSchema = z.iso.date().describe('Fecha de calendario AAAA-MM-DD');
export const dateTimeSchema = z.iso.datetime({ offset: true });
export const versionSchema = z.number().int().positive().describe('Versión para If-Match');

/**
 * Pesos con hasta dos decimales, como texto para no perder centavos («1500000.50»). La base los
 * guarda en numeric(18,2) y la API calcula con decimal.js.
 */
export const moneySchema = z
  .string()
  .trim()
  .regex(/^\d{1,16}(\.\d{1,2})?$/u, 'Escriba el valor en pesos, sin puntos de miles: 1500000.50')
  .describe('Pesos colombianos, con punto decimal y hasta dos decimales');

/** Código de una opción de catálogo, como LOST_PRICE. */
export const crmCatalogCodeSchema = z
  .string()
  .trim()
  .regex(/^[A-Z0-9][A-Z0-9_-]{0,19}$/u, 'Elija una opción de la lista');

export const optionalNoteSchema = z
  .string()
  .trim()
  .min(3, 'Escriba al menos tres letras.')
  .max(2000)
  .nullable()
  .default(null);

export const personRefSchema = z.object({ id: z.uuid(), name: z.string() });

export const optionRefSchema = z.object({ code: z.string(), label: z.string() });

export const listLimitSchema = z.coerce.number().int().min(1).max(200).default(50);

export type PersonRef = z.infer<typeof personRefSchema>;
export type OptionRef = z.infer<typeof optionRefSchema>;

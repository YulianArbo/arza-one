import { z } from 'zod';

// Parámetros tributarios vigentes (numeral 12.4, fin_tax_parameters). Llegan en B23 porque las
// cotizaciones calculan el impuesto con la tarifa vigente validada por el Contador (ficha 17.6);
// Finanzas (B31) los amplía. Cada clave tiene vigencias: un cambio crea una vigencia nueva y cierra
// la anterior el día antes, sin sobrescribirla.

/** Códigos estables de los errores de los parámetros tributarios (numeral 14.2). */
export const FINANCE_ERROR_CODES = {
  taxParameterUnknown: 'FIN_TAX_PARAMETER_UNKNOWN',
  taxValidFromInvalid: 'FIN_TAX_VALID_FROM_INVALID',
  invoiceNotFound: 'FIN_INVOICE_NOT_FOUND',
  milestoneNotBillable: 'FIN_MILESTONE_NOT_BILLABLE',
  invoiceStatusInvalid: 'FIN_INVOICE_STATUS_INVALID',
  fiscalFileInvalid: 'FIN_FISCAL_FILE_INVALID',
  creditNoteInvalid: 'FIN_CREDIT_NOTE_INVALID',
  paymentInvalid: 'FIN_PAYMENT_INVALID',
} as const;

/** Clave de un parámetro tributario, como IVA_GENERAL. */
export const taxKeySchema = z
  .string()
  .trim()
  .regex(/^[A-Z][A-Z0-9_]{1,39}$/u, 'Use mayúsculas, números y guion bajo: IVA_GENERAL')
  .describe('Clave del parámetro tributario');

/** Tarifa en porcentaje con hasta dos decimales, como «19» o «19.00». */
export const taxRateSchema = z
  .string()
  .trim()
  .regex(/^\d{1,3}(\.\d{1,2})?$/u, 'Escriba la tarifa en porcentaje, con punto decimal: 19.00')
  .refine((rate) => Number(rate) <= 100, 'La tarifa no puede pasar de 100 %.')
  .describe('Tarifa en porcentaje');

const calendarDate = z.iso.date();

export const taxParameterVersionSchema = z.object({
  id: z.uuid(),
  rate: taxRateSchema,
  valid_from: calendarDate,
  valid_to: calendarDate.nullable().describe('Último día de vigencia; vacío si sigue'),
  legal_basis: z.string(),
  created_at: z.iso.datetime({ offset: true }),
  created_by: z.object({ id: z.uuid(), name: z.string() }).nullable(),
});

export const taxParameterSummarySchema = z.object({
  key: taxKeySchema,
  label: z.string(),
  current: taxParameterVersionSchema.nullable().describe('Vigencia de hoy'),
  scheduled: taxParameterVersionSchema.nullable().describe('Vigencia que empieza más adelante'),
});

export const taxParameterListResponseSchema = z.object({
  data: z.array(taxParameterSummarySchema),
});

export const taxParameterHistoryResponseSchema = z.object({
  key: taxKeySchema,
  label: z.string(),
  data: z.array(taxParameterVersionSchema).describe('De la más reciente a la más antigua'),
});

const labelSchema = z.string().trim().min(3, 'Escriba al menos tres letras.').max(120);
const legalBasisSchema = z
  .string()
  .trim()
  .min(5, 'Escriba el fundamento: la norma y el artículo.')
  .max(500);

/** Nueva vigencia de un parámetro existente o un parámetro nuevo (con su nombre). */
export const createTaxParameterVersionRequestSchema = z.strictObject({
  key: taxKeySchema,
  label: labelSchema.nullable().default(null).describe('Obligatorio solo para una clave nueva'),
  rate: taxRateSchema,
  valid_from: calendarDate.describe('Primer día de la vigencia; hoy o más adelante'),
  legal_basis: legalBasisSchema,
});

export type TaxParameterVersion = z.infer<typeof taxParameterVersionSchema>;
export type TaxParameterSummary = z.infer<typeof taxParameterSummarySchema>;
export type TaxParameterListResponse = z.infer<typeof taxParameterListResponseSchema>;
export type TaxParameterHistoryResponse = z.infer<typeof taxParameterHistoryResponseSchema>;
export type CreateTaxParameterVersionRequest = z.infer<
  typeof createTaxParameterVersionRequestSchema
>;

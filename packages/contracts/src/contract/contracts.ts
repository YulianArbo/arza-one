import { z } from 'zod';

import {
  calendarDateSchema,
  dateTimeSchema,
  listLimitSchema,
  moneySchema,
  personRefSchema,
  versionSchema,
} from '../crm/common.js';
import { clauseKeySchema, templateSchema } from './clauses.js';
import {
  clauseOriginSchema,
  contractKindSchema,
  contractRenewalSchema,
  contractStatusSchema,
  optionalText,
  requiredText,
} from './common.js';
import { MAX_CLAUSES } from './contract-text.js';
import { amendmentSchema, obligationSchema } from './follow-up.js';

// Contratos y órdenes de servicio (B24, ficha 17.7): borrador → en revisión → aprobado → vigente →
// por vencer → terminado. Se generan desde una plantilla con los datos del cliente y, si la hay, de
// la cotización aceptada. Solo la Dirección aprueba; la firma electrónica llega con el B25 y, por
// ahora, se registra la copia firmada a mano (firma manuscrita digitalizada).

const contractDataFields = {
  title: requiredText(3, 160, 'Escriba un título corto para el contrato.'),
  object: requiredText(10, 4000, 'Describa el objeto del contrato.'),
  value: moneySchema
    .nullable()
    .default(null)
    .describe('Valor total en pesos; vacío solo en un acuerdo de confidencialidad'),
  payment_terms: optionalText(1000).describe('Forma de pago'),
  starts_on: calendarDateSchema.describe('Desde cuándo rige'),
  ends_on: calendarDateSchema.describe('Hasta cuándo rige'),
  renewal: contractRenewalSchema,
  responsible_id: z
    .uuid()
    .nullable()
    .default(null)
    .describe('Quien vigila el contrato; vacío para quien lo crea'),
  client_signer_name: requiredText(3, 160, 'Escriba el nombre de quien firma por el cliente.'),
  client_signer_document: requiredText(
    3,
    40,
    'Escriba el documento de quien firma por el cliente.',
  ),
};

export const createContractRequestSchema = z.strictObject({
  template_id: z.uuid().describe('Plantilla CT-COM u OS-COM'),
  party_id: z.uuid().describe('Cliente, desde Terceros'),
  quote_id: z.uuid().nullable().default(null).describe('Cotización aceptada de origen'),
  ...contractDataFields,
});

export const contractClauseRequestSchema = z.strictObject({
  clause_key: clauseKeySchema
    .nullable()
    .describe('Cláusula de la biblioteca; vacío si es una cláusula nueva'),
  title: requiredText(3, 120, 'Escriba el título de la cláusula.'),
  body: z
    .string()
    .trim()
    .min(10, 'Escriba el texto de la cláusula.')
    .max(10000)
    .nullable()
    .describe('Texto cambiado; vacío para usar el de la biblioteca con las variables'),
});

/** Guarda el borrador completo: los datos y las cláusulas juntos. */
export const updateContractRequestSchema = z.strictObject({
  ...contractDataFields,
  clauses: z
    .array(contractClauseRequestSchema)
    .min(1, 'El contrato necesita al menos una cláusula.')
    .max(MAX_CLAUSES, `Un contrato tiene como máximo ${String(MAX_CLAUSES)} cláusulas.`),
});

export const approveContractRequestSchema = z.strictObject({
  comment: optionalText(2000),
  reviewed_clause_ids: z
    .array(z.uuid())
    .max(MAX_CLAUSES)
    .default([])
    .describe('Las cláusulas modificadas o nuevas que la Dirección revisó, una por una'),
  legal_note: optionalText(2000).describe('Concepto jurídico, si aplica'),
});

export const returnContractRequestSchema = z.strictObject({
  comment: requiredText(3, 2000, 'Escriba qué debe corregirse.'),
});

/** Firma manuscrita digitalizada: el PDF escaneado con las firmas y la fecha en que se firmó. */
export const registerSignatureRequestSchema = z.strictObject({
  file_id: z.uuid().describe('PDF firmado que usted subió y que ya pasó el antivirus'),
  signed_on: calendarDateSchema.describe('Fecha de la última firma'),
});

export const terminateContractRequestSchema = z.strictObject({
  terminated_on: calendarDateSchema,
  reason: requiredText(3, 2000, 'Escriba por qué termina el contrato.'),
});

export const renewContractRequestSchema = z.strictObject({
  new_ends_on: calendarDateSchema.describe('Nueva fecha de terminación'),
  summary: requiredText(3, 500, 'Escriba por qué se prorroga.'),
});

export const contractDocumentSchema = z
  .enum(['generated', 'signed'])
  .describe('El PDF generado al aprobar o la copia firmada');

export const contractPdfRequestSchema = z.strictObject({ document: contractDocumentSchema });

export const contractClauseSchema = z.object({
  id: z.uuid(),
  position: z.number().int().positive(),
  ordinal: z.string().nullable().describe('PRIMERA, SEGUNDA…; vacío en el encabezado'),
  clause_key: clauseKeySchema.nullable(),
  clause_version: z.number().int().positive().nullable(),
  title: z.string(),
  body: z.string(),
  origin: clauseOriginSchema,
  library_text: z
    .string()
    .nullable()
    .describe('Texto de la biblioteca con las variables, para comparar una modificada'),
  required: z.boolean(),
});

const codeRef = z.object({ id: z.uuid(), code: z.string() });

export const contractSummarySchema = z.object({
  id: z.uuid(),
  code: z.string().describe('CTR-AAAA-NNNN u OS-AAAA-NNNN'),
  kind: contractKindSchema,
  title: z.string(),
  party: personRefSchema.describe('Cliente'),
  status: contractStatusSchema,
  value: moneySchema.nullable(),
  starts_on: calendarDateSchema,
  ends_on: calendarDateSchema,
  responsible: personRefSchema.nullable(),
  has_modified_clauses: z.boolean(),
  created_at: dateTimeSchema,
  version: versionSchema,
});

const fileRefSchema = z.object({ id: z.uuid(), file_name: z.string() });

export const contractDetailSchema = contractSummarySchema.extend({
  object: z.string(),
  payment_terms: z.string().nullable(),
  renewal: contractRenewalSchema,
  client_signer_name: z.string(),
  client_signer_document: z.string(),
  template: codeRef.extend({ name: z.string() }),
  quote: codeRef.extend({ version_number: z.number().int().positive() }).nullable(),
  author: personRefSchema.nullable(),
  clauses: z.array(contractClauseSchema),
  approval: z.object({
    submitted_at: dateTimeSchema.nullable(),
    decided_by: personRefSchema.nullable(),
    decided_at: dateTimeSchema.nullable(),
    note: z.string().nullable().describe('Comentario de quien aprobó o devolvió'),
    legal_note: z.string().nullable(),
  }),
  pdf: z.object({
    status: z.enum(['none', 'pending', 'ready']),
    file_name: z.string().nullable(),
    sha256: z.string().nullable().describe('Huella SHA-256 del PDF aprobado'),
  }),
  signed: z
    .object({ file: fileRefSchema, signed_on: calendarDateSchema, by: personRefSchema.nullable() })
    .nullable(),
  termination: z
    .object({
      terminated_on: calendarDateSchema,
      reason: z.string(),
      by: personRefSchema.nullable(),
    })
    .nullable(),
  last_alert_days: z
    .number()
    .int()
    .nullable()
    .describe('Última alerta de vencimiento: 90, 60 o 30'),
  obligations: z.array(obligationSchema),
  amendments: z.array(amendmentSchema),
});

export const contractListQuerySchema = z.strictObject({
  status: contractStatusSchema.optional(),
  kind: contractKindSchema.optional(),
  party_id: z.uuid().optional(),
  q: z.string().trim().min(1).max(120).optional().describe('Busca en código, título y cliente'),
  limit: listLimitSchema,
  cursor: z.uuid().optional(),
});

export const contractListResponseSchema = z.object({
  data: z.array(contractSummarySchema),
  next_cursor: z.uuid().nullable(),
});

export const contractOptionsQuerySchema = z.strictObject({
  party_id: z.uuid().optional().describe('Para proponer quién firma por el cliente'),
  quote_id: z.uuid().optional().describe('Cotización aceptada para llenar el asistente'),
});

/** Lo que necesita el asistente: plantillas, quién firma por el cliente y la cotización. */
export const contractOptionsSchema = z.object({
  templates: z.array(templateSchema),
  signers: z.array(z.object({ name: z.string(), document: z.string().nullable() })),
  quote: z
    .object({
      id: z.uuid(),
      code: z.string(),
      version_number: z.number().int().positive(),
      party: personRefSchema,
      title: z.string(),
      object: z.string(),
      value: moneySchema,
      payment_terms: z.string(),
    })
    .nullable(),
});

export type CreateContractRequest = z.infer<typeof createContractRequestSchema>;
export type ContractClauseRequest = z.infer<typeof contractClauseRequestSchema>;
export type UpdateContractRequest = z.infer<typeof updateContractRequestSchema>;
export type ApproveContractRequest = z.infer<typeof approveContractRequestSchema>;
export type ReturnContractRequest = z.infer<typeof returnContractRequestSchema>;
export type RegisterSignatureRequest = z.infer<typeof registerSignatureRequestSchema>;
export type TerminateContractRequest = z.infer<typeof terminateContractRequestSchema>;
export type RenewContractRequest = z.infer<typeof renewContractRequestSchema>;
export type ContractDocument = z.infer<typeof contractDocumentSchema>;
export type ContractPdfRequest = z.infer<typeof contractPdfRequestSchema>;
export type ContractClause = z.infer<typeof contractClauseSchema>;
export type ContractSummary = z.infer<typeof contractSummarySchema>;
export type ContractDetail = z.infer<typeof contractDetailSchema>;
export type ContractListQuery = z.infer<typeof contractListQuerySchema>;
export type ContractListResponse = z.infer<typeof contractListResponseSchema>;
export type ContractOptionsQuery = z.infer<typeof contractOptionsQuerySchema>;
export type ContractOptions = z.infer<typeof contractOptionsSchema>;

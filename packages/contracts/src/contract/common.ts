import { z } from 'zod';

// Piezas comunes de Contratos (M06, B24; ficha 17.7): estados, tipos, códigos de error y textos.

/** Códigos estables de los errores de Contratos (numeral 14.2). */
export const CONTRACT_ERROR_CODES = {
  notFound: 'CONTRACT_NOT_FOUND',
  statusInvalid: 'CONTRACT_STATUS_INVALID',
  partyInvalid: 'CONTRACT_PARTY_INVALID',
  quoteInvalid: 'CONTRACT_QUOTE_INVALID',
  templateInvalid: 'CONTRACT_TEMPLATE_INVALID',
  responsibleInvalid: 'CONTRACT_RESPONSIBLE_INVALID',
  datesInvalid: 'CONTRACT_DATES_INVALID',
  valueRequired: 'CONTRACT_VALUE_REQUIRED',
  clausesInvalid: 'CONTRACT_CLAUSES_INVALID',
  clauseDuplicate: 'CONTRACT_CLAUSE_DUPLICATE',
  clauseVariableUnknown: 'CONTRACT_CLAUSE_VARIABLE_UNKNOWN',
  reviewIncomplete: 'CONTRACT_REVIEW_INCOMPLETE',
  selfApproval: 'CONTRACT_SELF_APPROVAL',
  fileInvalid: 'CONTRACT_FILE_INVALID',
  pdfNotReady: 'CONTRACT_PDF_NOT_READY',
} as const;

export const CONTRACT_STATUSES = {
  draft: 'Borrador',
  in_review: 'En revisión',
  approved: 'Aprobado',
  active: 'Vigente',
  expiring: 'Por vencer',
  terminated: 'Terminado',
} as const;

export type ContractStatus = keyof typeof CONTRACT_STATUSES;

export const contractStatusSchema = z
  .enum(Object.keys(CONTRACT_STATUSES) as [ContractStatus, ...ContractStatus[]])
  .describe('Estado del contrato');

/** Estados en que el contrato rige: tiene obligaciones, otrosíes y alertas. */
export const IN_FORCE_STATUSES: readonly ContractStatus[] = ['active', 'expiring'];

export const CONTRACT_KINDS = {
  contract: 'Contrato',
  nda: 'Acuerdo de confidencialidad',
  service_order: 'Orden de servicio',
} as const;

export type ContractKind = keyof typeof CONTRACT_KINDS;

export const contractKindSchema = z
  .enum(Object.keys(CONTRACT_KINDS) as [ContractKind, ...ContractKind[]])
  .describe('Tipo de documento');

export const CONTRACT_RENEWALS = {
  none: 'Sin renovación',
  automatic: 'Renovación automática (la plataforma avisa; no lo prorroga sola)',
  by_agreement: 'Renovación por acuerdo de las partes',
} as const;

export type ContractRenewal = keyof typeof CONTRACT_RENEWALS;

export const contractRenewalSchema = z
  .enum(Object.keys(CONTRACT_RENEWALS) as [ContractRenewal, ...ContractRenewal[]])
  .describe('Cómo se renueva');

export const CLAUSE_ORIGINS = {
  library: 'De la biblioteca',
  modified: 'Modificada',
  added: 'Nueva',
} as const;

export type ClauseOrigin = keyof typeof CLAUSE_ORIGINS;

export const clauseOriginSchema = z
  .enum(Object.keys(CLAUSE_ORIGINS) as [ClauseOrigin, ...ClauseOrigin[]])
  .describe('De dónde sale el texto de la cláusula');

/** Días antes del fin en que se avisa al responsable (ficha 17.7). */
export const EXPIRY_ALERT_DAYS = [90, 60, 30] as const;

/** Días antes de la fecha de una obligación en que se avisa a su responsable. */
export const OBLIGATION_NOTICE_DAYS = 7;

export function requiredText(min: number, max: number, message: string): z.ZodString {
  return z.string().trim().min(min, message).max(max);
}

export function optionalText(max: number): z.ZodDefault<z.ZodNullable<z.ZodString>> {
  return z
    .string()
    .trim()
    .min(3, 'Escriba al menos tres letras.')
    .max(max)
    .nullable()
    .default(null);
}

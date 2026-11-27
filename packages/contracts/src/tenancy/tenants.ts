import { z } from 'zod';

import { recordNameSchema } from '../core/org.js';
import { isValidNit } from '../party/nit.js';
import { planLimitsSchema, tenantPlanSchema } from './plans.js';

// Empresas de la plataforma (B48): las administra el operador de la plataforma desde la empresa
// que opera ARZA ONE. El operador ve solo la ficha de cada empresa, nunca su contenido
// (decisión 2).

/** Códigos estables de los errores de multiempresa (numeral 14.2). */
export const TENANCY_ERROR_CODES = {
  operatorOnly: 'TENANCY_OPERATOR_ONLY',
  operatorProtected: 'TENANCY_OPERATOR_PROTECTED',
  tenantNotFound: 'TENANCY_TENANT_NOT_FOUND',
  statusInvalid: 'TENANCY_STATUS_INVALID',
  exportRequired: 'TENANCY_EXPORT_REQUIRED',
  taxIdMismatch: 'TENANCY_TAX_ID_MISMATCH',
  exportNotFound: 'TENANCY_EXPORT_NOT_FOUND',
  exportNotReady: 'TENANCY_EXPORT_NOT_READY',
  exportInProgress: 'TENANCY_EXPORT_IN_PROGRESS',
  planLimitReached: 'PLAN_LIMIT_REACHED',
  tenantSuspended: 'TENANT_SUSPENDED',
  logoInvalid: 'TENANCY_LOGO_INVALID',
} as const;

/** Días de espera entre la solicitud de eliminación y el borrado (decisión 6). */
export const TENANT_DELETION_GRACE_DAYS = 30;

/** Vida de una exportación lista: después se borra (decisión 3). */
export const TENANT_EXPORT_TTL_DAYS = 7;

/** Una exportación sirve para pedir la eliminación si se generó en estos días. */
export const TENANT_EXPORT_FRESH_DAYS = 30;

export const tenantStatusSchema = z
  .enum(['active', 'suspended', 'closed'])
  .describe('Activa, suspendida o cerrada (eliminada)');

/** NIT con su dígito de verificación correcto (ficha 17.3). */
export const verifiedTaxIdSchema = z
  .string()
  .trim()
  .regex(/^\d{5,15}-\d$/, 'Escriba el NIT con el dígito de verificación, por ejemplo 900123456-7')
  .refine(
    (value) => {
      const [nit = '', digit = ''] = value.split('-');
      return isValidNit(nit, Number(digit));
    },
    { message: 'El dígito de verificación no corresponde al NIT.' },
  );

const reasonSchema = z.string().trim().min(10).max(500).describe('Motivo, para la auditoría');

export const platformTenantSchema = z.object({
  id: z.uuid(),
  legal_name: z.string(),
  trade_name: z.string().nullable(),
  tax_id: z.string(),
  status: tenantStatusSchema,
  is_operator: z.boolean().describe('La empresa que opera la plataforma; no se suspende'),
  plan: tenantPlanSchema,
  limits: planLimitsSchema.describe('Los del plan con los ajustes de la empresa'),
  usage: z
    .object({
      internal_users: z.number().int().nonnegative(),
      portal_users: z.number().int().nonnegative(),
      storage_mb: z.number().nonnegative(),
    })
    .nullable()
    .describe('null en una empresa cerrada'),
  suspended_at: z.iso.datetime().nullable(),
  suspension_reason: z.string().nullable(),
  deletion_due_on: z.iso.date().nullable().describe('Fecha en que se borrarán sus datos'),
  closed_at: z.iso.datetime().nullable(),
  last_export_at: z.iso.datetime().nullable().describe('Última exportación lista'),
  created_at: z.iso.datetime(),
  version: z.number().int().positive(),
});

export const platformTenantListResponseSchema = z.object({
  data: z.array(platformTenantSchema),
});

export const createPlatformTenantSchema = z.strictObject({
  legal_name: recordNameSchema.describe('Razón social'),
  trade_name: recordNameSchema.nullable().describe('Nombre comercial'),
  tax_id: verifiedTaxIdSchema,
  plan: tenantPlanSchema,
  admin: z.strictObject({
    email: z.email().max(254).describe('Correo del primer administrador de la empresa'),
    display_name: z.string().trim().min(2).max(120),
  }),
});

const overrideUsers = z.number().int().min(1).max(100_000).nullable();

export const changeTenantPlanSchema = z.strictObject({
  plan: tenantPlanSchema,
  max_internal_users: overrideUsers.describe('null: el del plan'),
  max_portal_users: overrideUsers.describe('null: el del plan'),
  storage_mb: z.number().int().min(100).max(10_000_000).nullable().describe('null: el del plan'),
  ai_assistant: z.boolean().nullable().describe('null: el del plan'),
});

export const suspendTenantSchema = z.strictObject({ reason: reasonSchema });

export const requestTenantDeletionSchema = z.strictObject({
  reason: reasonSchema,
  confirm_tax_id: z.string().trim().describe('El NIT de la empresa, escrito para confirmar'),
});

export const tenantCreatedResponseSchema = z.object({
  id: z.uuid(),
  admin_user_id: z.uuid(),
});

export type TenantStatus = z.infer<typeof tenantStatusSchema>;
export type PlatformTenant = z.infer<typeof platformTenantSchema>;
export type PlatformTenantListResponse = z.infer<typeof platformTenantListResponseSchema>;
export type CreatePlatformTenantRequest = z.infer<typeof createPlatformTenantSchema>;
export type ChangeTenantPlanRequest = z.infer<typeof changeTenantPlanSchema>;
export type SuspendTenantRequest = z.infer<typeof suspendTenantSchema>;
export type RequestTenantDeletionRequest = z.infer<typeof requestTenantDeletionSchema>;
export type TenantCreatedResponse = z.infer<typeof tenantCreatedResponseSchema>;

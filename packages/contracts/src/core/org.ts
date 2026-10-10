import { z } from 'zod';

// Contratos de la empresa y su organización (M00, B12): datos legales, sedes, procesos y áreas,
// cargos y centros de costo (numeral 14.3).

/** Códigos estables de los errores del núcleo (numeral 14.2). */
export const CORE_ERROR_CODES = {
  notFound: 'CORE_RECORD_NOT_FOUND',
  codeTaken: 'CORE_CODE_TAKEN',
  taxIdTaken: 'CORE_TAX_ID_TAKEN',
  inUse: 'CORE_RECORD_IN_USE',
  hierarchyCycle: 'CORE_HIERARCHY_CYCLE',
  mainSiteRequired: 'CORE_MAIN_SITE_REQUIRED',
  parameterUnknown: 'CORE_PARAMETER_UNKNOWN',
  parameterValueInvalid: 'CORE_PARAMETER_VALUE_INVALID',
  parameterValidFromInvalid: 'CORE_PARAMETER_VALID_FROM_INVALID',
  sequenceUnknown: 'CORE_SEQUENCE_UNKNOWN',
  holidayTaken: 'CORE_HOLIDAY_TAKEN',
} as const;

export const recordNameSchema = z.string().trim().min(2).max(120);

/** Código corto de negocio, como «COM» o «CC-010». */
export const businessCodeSchema = z
  .string()
  .trim()
  .regex(/^[A-Z0-9][A-Z0-9-]{0,19}$/, 'Use mayúsculas, números y guiones; máximo 20 caracteres');

const versionField = z.number().int().positive().describe('Versión para la cabecera If-Match');

// --- Empresa -------------------------------------------------------------------------------

export const taxIdSchema = z
  .string()
  .trim()
  .regex(/^\d{5,15}-\d$/, 'Escriba el NIT con el dígito de verificación, por ejemplo 900123456-7');

export const tenantProfileSchema = z.object({
  id: z.uuid(),
  legal_name: z.string(),
  trade_name: z.string().nullable(),
  tax_id: z.string(),
  version: versionField,
});

export const updateTenantRequestSchema = z.strictObject({
  legal_name: recordNameSchema.describe('Razón social'),
  trade_name: recordNameSchema.nullable().describe('Nombre comercial'),
  tax_id: taxIdSchema,
});

// --- Sedes ---------------------------------------------------------------------------------

export const siteSchema = z.object({
  id: z.uuid(),
  name: z.string(),
  city: z.string(),
  address: z.string(),
  is_main: z.boolean().describe('Sede principal; solo una'),
  is_active: z.boolean(),
  version: versionField,
});

export const createSiteRequestSchema = z.strictObject({
  name: recordNameSchema,
  city: recordNameSchema,
  address: z.string().trim().min(5).max(200),
  is_main: z.boolean().default(false),
});

export const updateSiteRequestSchema = createSiteRequestSchema.extend({ is_active: z.boolean() });

export const siteListResponseSchema = z.object({ data: z.array(siteSchema) });

// --- Procesos y áreas ----------------------------------------------------------------------

export const orgUnitKindSchema = z.enum(['process', 'area']).describe('Proceso o área');

export const orgUnitSchema = z.object({
  id: z.uuid(),
  parent_id: z.uuid().nullable().describe('Proceso o área de la que depende'),
  code: z.string(),
  name: z.string(),
  kind: orgUnitKindSchema,
  owner_position_id: z.uuid().nullable().describe('Cargo líder del proceso'),
  is_active: z.boolean(),
  version: versionField,
});

export const createOrgUnitRequestSchema = z.strictObject({
  parent_id: z.uuid().nullable().default(null),
  code: businessCodeSchema,
  name: recordNameSchema,
  kind: orgUnitKindSchema,
  owner_position_id: z.uuid().nullable().default(null),
});

export const updateOrgUnitRequestSchema = createOrgUnitRequestSchema.extend({
  is_active: z.boolean(),
});

export const orgUnitListResponseSchema = z.object({ data: z.array(orgUnitSchema) });

// --- Cargos --------------------------------------------------------------------------------

export const positionSchema = z.object({
  id: z.uuid(),
  org_unit_id: z.uuid().describe('Proceso o área del cargo'),
  name: z.string(),
  reports_to_id: z.uuid().nullable().describe('Cargo al que reporta; vacío en la cabeza'),
  is_active: z.boolean(),
  version: versionField,
});

export const createPositionRequestSchema = z.strictObject({
  org_unit_id: z.uuid(),
  name: recordNameSchema,
  reports_to_id: z.uuid().nullable().default(null),
});

export const updatePositionRequestSchema = createPositionRequestSchema.extend({
  is_active: z.boolean(),
});

export const positionListResponseSchema = z.object({ data: z.array(positionSchema) });

// --- Centros de costo ----------------------------------------------------------------------

export const costCenterSchema = z.object({
  id: z.uuid(),
  code: z.string(),
  name: z.string(),
  org_unit_id: z.uuid().nullable(),
  is_active: z.boolean(),
  version: versionField,
});

export const createCostCenterRequestSchema = z.strictObject({
  code: businessCodeSchema,
  name: recordNameSchema,
  org_unit_id: z.uuid().nullable().default(null),
});

export const updateCostCenterRequestSchema = createCostCenterRequestSchema.extend({
  is_active: z.boolean(),
});

export const costCenterListResponseSchema = z.object({ data: z.array(costCenterSchema) });

export type TenantProfile = z.infer<typeof tenantProfileSchema>;
export type UpdateTenantRequest = z.infer<typeof updateTenantRequestSchema>;
export type Site = z.infer<typeof siteSchema>;
export type CreateSiteRequest = z.infer<typeof createSiteRequestSchema>;
export type UpdateSiteRequest = z.infer<typeof updateSiteRequestSchema>;
export type SiteListResponse = z.infer<typeof siteListResponseSchema>;
export type OrgUnitKind = z.infer<typeof orgUnitKindSchema>;
export type OrgUnit = z.infer<typeof orgUnitSchema>;
export type CreateOrgUnitRequest = z.infer<typeof createOrgUnitRequestSchema>;
export type UpdateOrgUnitRequest = z.infer<typeof updateOrgUnitRequestSchema>;
export type OrgUnitListResponse = z.infer<typeof orgUnitListResponseSchema>;
export type Position = z.infer<typeof positionSchema>;
export type CreatePositionRequest = z.infer<typeof createPositionRequestSchema>;
export type UpdatePositionRequest = z.infer<typeof updatePositionRequestSchema>;
export type PositionListResponse = z.infer<typeof positionListResponseSchema>;
export type CostCenter = z.infer<typeof costCenterSchema>;
export type CreateCostCenterRequest = z.infer<typeof createCostCenterRequestSchema>;
export type UpdateCostCenterRequest = z.infer<typeof updateCostCenterRequestSchema>;
export type CostCenterListResponse = z.infer<typeof costCenterListResponseSchema>;

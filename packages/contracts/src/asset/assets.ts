import { z } from 'zod';

import { moneySchema } from '../finance/money.js';

// Activos (B34, ficha 17.12, RE-ADM-003 y CT-ADM-001): inventario de activos fijos y licencias,
// asignación en comodato con contrato firmado, mantenimientos y bajas. La depreciación solo se
// informa: no se contabiliza en la plataforma.

/** Códigos estables de los errores de Activos (numeral 14.2). */
export const ASSET_ERROR_CODES = {
  recordNotFound: 'AST_RECORD_NOT_FOUND',
  recordInvalid: 'AST_RECORD_INVALID',
  statusInvalid: 'AST_STATUS_INVALID',
  holderNotReady: 'AST_HOLDER_NOT_READY',
  formUnavailable: 'AST_FORM_UNAVAILABLE',
} as const;

const idSchema = z.uuid();
const dateSchema = z.iso.date();
const textSchema = (min: number, max: number) => z.string().trim().min(min).max(max);
const optionalText = (max: number) => textSchema(1, max).nullable().default(null);

export const ASSET_CATEGORIES = {
  computer: 'Equipo de cómputo',
  peripheral: 'Periféricos',
  furniture: 'Muebles y enseres',
  software_license: 'Licencia de software',
  other: 'Otros',
} as const;
export type AssetCategory = keyof typeof ASSET_CATEGORIES;
export const assetCategorySchema = z.enum(
  Object.keys(ASSET_CATEGORIES) as [AssetCategory, ...AssetCategory[]],
);

export const ASSET_STATUS = {
  available: 'Disponible',
  reserved: 'Pendiente de firma',
  assigned: 'Asignado',
  retired: 'Dado de baja',
} as const;
export type AssetStatus = keyof typeof ASSET_STATUS;
export const assetStatusSchema = z.enum(
  Object.keys(ASSET_STATUS) as [AssetStatus, ...AssetStatus[]],
);

export const ASSIGNMENT_STATUS = {
  preparing: 'Preparando el comodato',
  in_signature: 'En firma',
  active: 'Vigente',
  returned: 'Devuelto',
  cancelled: 'Anulada',
} as const;
export type AssignmentStatus = keyof typeof ASSIGNMENT_STATUS;
export const assignmentStatusSchema = z.enum(
  Object.keys(ASSIGNMENT_STATUS) as [AssignmentStatus, ...AssignmentStatus[]],
);

export const RETIRE_REASONS = {
  damage: 'Daño',
  obsolescence: 'Obsolescencia',
  loss: 'Pérdida o robo',
  sale: 'Venta',
  donation: 'Donación',
} as const;
export type RetireReason = keyof typeof RETIRE_REASONS;
export const retireReasonSchema = z.enum(
  Object.keys(RETIRE_REASONS) as [RetireReason, ...RetireReason[]],
);

export const MAINTENANCE_KINDS = { preventive: 'Preventivo', corrective: 'Correctivo' } as const;
export type MaintenanceKind = keyof typeof MAINTENANCE_KINDS;
export const maintenanceKindSchema = z.enum(['preventive', 'corrective']);

/** Días que tiene el colaborador para firmar el comodato antes de que la asignación se anule. */
export const LOAN_SIGNATURE_DAYS = 15;

export const assetPersonRefSchema = z.object({ id: idSchema, name: z.string() });

/** La asignación de un activo: quién lo tiene y cómo va su contrato de comodato. */
export const assetAssignmentSchema = z.object({
  id: idSchema,
  holder: assetPersonRefSchema,
  status: assignmentStatusSchema,
  assigned_on: dateSchema,
  sign_by: dateSchema,
  /** Código del registro CT-ADM-001 y del proceso de firma. */
  record_code: z.string().nullable(),
  envelope_code: z.string().nullable(),
  /** El comodato firmado; existe siempre que la asignación está vigente o devuelta. */
  contract_document_id: idSchema.nullable(),
  returned_on: dateSchema.nullable(),
  return_note: z.string().nullable(),
  closed_reason: z.string().nullable(),
  version: z.number().int().positive(),
});

export const assetSchema = z.object({
  id: idSchema,
  code: z.string(),
  name: z.string(),
  category: assetCategorySchema,
  serial: z.string().nullable(),
  purchase_date: dateSchema,
  cost: moneySchema,
  useful_life_months: z.number().int().positive(),
  status: assetStatusSchema,
  location: z.string().nullable(),
  /** La asignación abierta (en preparación, en firma o vigente), si la hay. */
  assignment: assetAssignmentSchema.nullable(),
  retired_on: dateSchema.nullable(),
  retire_reason: retireReasonSchema.nullable(),
  retire_note: z.string().nullable(),
  /** Depreciación en línea recta, informativa: no se contabiliza. */
  accumulated_depreciation: moneySchema,
  book_value: moneySchema,
  version: z.number().int().positive(),
});

export const assetMaintenanceSchema = z.object({
  id: idSchema,
  asset: z.object({ id: idSchema, code: z.string(), name: z.string() }),
  kind: maintenanceKindSchema,
  scheduled_on: dateSchema,
  done_on: dateSchema.nullable(),
  cost: moneySchema.nullable(),
  note: z.string().nullable(),
  version: z.number().int().positive(),
});

export const assetListResponseSchema = z.object({ data: z.array(assetSchema) });
export const assetDetailResponseSchema = z.object({
  asset: assetSchema,
  assignments: z.array(assetAssignmentSchema),
  maintenance: z.array(assetMaintenanceSchema),
});
export const assetMaintenanceListResponseSchema = z.object({
  data: z.array(assetMaintenanceSchema),
});
export const assetCreatedResponseSchema = z.object({ id: idSchema });

/** A quién se puede asignar: colaboradores activos; «ready» si ya puede firmar el comodato. */
export const assetAssigneeSchema = z.object({
  id: idSchema,
  name: z.string(),
  ready: z.boolean(),
});
export const assetAssigneeListResponseSchema = z.object({ data: z.array(assetAssigneeSchema) });

export const assetListQuerySchema = z.strictObject({
  holder_id: idSchema.optional().describe('Solo los activos a cargo de esa persona'),
});

export const saveAssetSchema = z.strictObject({
  name: textSchema(2, 200),
  category: assetCategorySchema,
  serial: optionalText(100),
  purchase_date: dateSchema,
  cost: moneySchema,
  useful_life_months: z.number().int().min(1).max(600),
  location: optionalText(200),
});

export const assignAssetSchema = z.strictObject({
  user_id: idSchema,
  assigned_on: dateSchema,
  message: optionalText(1000),
});

export const cancelAssignmentSchema = z.strictObject({ reason: textSchema(3, 1000) });

export const returnAssetSchema = z.strictObject({
  returned_on: dateSchema,
  note: textSchema(3, 1000).describe('Estado en que se devuelve el activo'),
});

export const retireAssetSchema = z.strictObject({
  retired_on: dateSchema,
  reason: retireReasonSchema,
  note: textSchema(3, 1000),
});

export const scheduleMaintenanceSchema = z.strictObject({
  kind: maintenanceKindSchema,
  scheduled_on: dateSchema,
  note: optionalText(1000),
});

export const completeMaintenanceSchema = z.strictObject({
  done_on: dateSchema,
  cost: moneySchema,
  note: optionalText(1000),
});

export type AssetPersonRef = z.infer<typeof assetPersonRefSchema>;
export type AssetAssignment = z.infer<typeof assetAssignmentSchema>;
export type Asset = z.infer<typeof assetSchema>;
export type AssetMaintenance = z.infer<typeof assetMaintenanceSchema>;
export type AssetDetail = z.infer<typeof assetDetailResponseSchema>;
export type AssetAssignee = z.infer<typeof assetAssigneeSchema>;
export type AssetListQuery = z.infer<typeof assetListQuerySchema>;
export type SaveAsset = z.infer<typeof saveAssetSchema>;
export type AssignAsset = z.infer<typeof assignAssetSchema>;
export type ReturnAsset = z.infer<typeof returnAssetSchema>;
export type RetireAsset = z.infer<typeof retireAssetSchema>;
export type ScheduleMaintenance = z.infer<typeof scheduleMaintenanceSchema>;
export type CompleteMaintenance = z.infer<typeof completeMaintenanceSchema>;

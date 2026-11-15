import { z } from 'zod';

import { positiveMoneySchema } from '../finance/money.js';
import { PURCHASE_TIERS, purchaseTiersSchema } from './tiers.js';

// Compras (B33, ficha 17.12): solicitud → aprobación por montos → cotizaciones y cuadro
// comparativo → orden → recepción → cierre. Quien solicita no aprueba ni recibe.

/** Códigos estables de los errores de Compras (numeral 14.2). */
export const PURCHASE_ERROR_CODES = {
  recordNotFound: 'PUR_RECORD_NOT_FOUND',
  recordInvalid: 'PUR_RECORD_INVALID',
  statusInvalid: 'PUR_STATUS_INVALID',
  segregationRequired: 'PUR_SEGREGATION_REQUIRED',
  quotesMissing: 'PUR_QUOTES_MISSING',
  supplierNotVerified: 'PUR_SUPPLIER_NOT_VERIFIED',
  approvalLevelRequired: 'PUR_APPROVAL_LEVEL_REQUIRED',
  tiersMissing: 'PUR_TIERS_MISSING',
  supportFileInvalid: 'PUR_SUPPORT_FILE_INVALID',
} as const;

const idSchema = z.uuid();
const dateSchema = z.iso.date();
const textSchema = (min: number, max: number) => z.string().trim().min(min).max(max);

export const PURCHASE_REQUEST_STATUS = [
  'draft',
  'in_approval',
  'approved',
  'rejected',
  'quoted',
  'ordered',
  'received',
  'closed',
] as const;
export type PurchaseRequestStatus = (typeof PURCHASE_REQUEST_STATUS)[number];

export const PURCHASE_ORDER_STATUS = ['issued', 'received', 'closed'] as const;
export type PurchaseOrderStatus = (typeof PURCHASE_ORDER_STATUS)[number];

export const purchasePersonRefSchema = z.object({ id: idSchema, name: z.string() });
export const purchaseCostCenterRefSchema = z.object({
  id: idSchema,
  code: z.string(),
  name: z.string(),
});

/** Proveedor con el estado de su conocimiento del tercero: sin él vigente no se le ordena. */
export const purchaseSupplierRefSchema = z.object({
  id: idSchema,
  name: z.string(),
  verified: z.boolean(),
});

export const purchaseQuoteSchema = z.object({
  id: idSchema,
  supplier: purchaseSupplierRefSchema,
  amount: positiveMoneySchema,
  delivery_days: z.number().int().nonnegative(),
  file_id: idSchema,
  selected: z.boolean(),
});

export const purchaseRequestSchema = z.object({
  id: idSchema,
  code: z.string(),
  description: z.string(),
  estimated_amount: positiveMoneySchema,
  /** Valor que manda para aprobar: el de la cotización elegida o, si no hay, el estimado. */
  approval_amount: positiveMoneySchema,
  /** Tramo del valor que manda; null si la empresa no tiene topes vigentes. */
  tier: z.enum(PURCHASE_TIERS).nullable(),
  min_quotes: z.number().int().positive().nullable(),
  cost_center: purchaseCostCenterRefSchema,
  requester: purchasePersonRefSchema,
  status: z.enum(PURCHASE_REQUEST_STATUS),
  decision_note: z.string().nullable(),
  mine: z.boolean(),
  quotes: z.array(purchaseQuoteSchema),
  order: z
    .object({ id: idSchema, code: z.string(), status: z.enum(PURCHASE_ORDER_STATUS) })
    .nullable(),
  version: z.number().int().positive(),
});

export const purchaseRequestListResponseSchema = z.object({
  data: z.array(purchaseRequestSchema),
});

export const savePurchaseRequestSchema = z.strictObject({
  cost_center_id: idSchema,
  description: textSchema(3, 1000),
  estimated_amount: positiveMoneySchema,
});

export const rejectPurchaseSchema = z.strictObject({ reason: textSchema(3, 2000) });

export const addPurchaseQuoteSchema = z.strictObject({
  supplier_id: idSchema,
  amount: positiveMoneySchema,
  delivery_days: z
    .number()
    .int('Escriba días enteros.')
    .min(0, 'Los días de entrega no pueden ser negativos.')
    .max(365, 'El plazo de entrega va hasta 365 días.'),
  file_id: idSchema,
});

export const purchaseReceiptSchema = z.object({
  id: idSchema,
  received_on: dateSchema,
  received_by: purchasePersonRefSchema,
  conforming: z.boolean(),
  note: z.string().nullable(),
});

export const purchaseOrderSchema = z.object({
  id: idSchema,
  code: z.string(),
  request: z.object({ id: idSchema, code: z.string(), description: z.string() }),
  supplier: z.object({ id: idSchema, name: z.string() }),
  total: positiveMoneySchema,
  status: z.enum(PURCHASE_ORDER_STATUS),
  issued_at: z.iso.datetime(),
  /** La persona pidió esta compra: no puede recibirla. */
  requested_by_me: z.boolean(),
  receipts: z.array(purchaseReceiptSchema),
  version: z.number().int().positive(),
});

export const purchaseOrderListResponseSchema = z.object({ data: z.array(purchaseOrderSchema) });

export const registerReceiptSchema = z
  .strictObject({
    received_on: dateSchema,
    conforming: z.boolean(),
    note: textSchema(3, 2000).nullable(),
  })
  .refine((receipt) => receipt.conforming || receipt.note !== null, {
    message: 'Explique qué no llegó conforme.',
    path: ['note'],
  });

export const purchaseOptionsResponseSchema = z.object({
  data: z.object({
    cost_centers: z.array(purchaseCostCenterRefSchema),
    suppliers: z.array(purchaseSupplierRefSchema),
    tiers: purchaseTiersSchema.nullable(),
  }),
});

export const purchaseCreatedResponseSchema = z.object({ id: idSchema });

export type PurchaseQuote = z.infer<typeof purchaseQuoteSchema>;
export type PurchaseRequest = z.infer<typeof purchaseRequestSchema>;
export type SavePurchaseRequest = z.infer<typeof savePurchaseRequestSchema>;
export type AddPurchaseQuote = z.infer<typeof addPurchaseQuoteSchema>;
export type PurchaseReceipt = z.infer<typeof purchaseReceiptSchema>;
export type PurchaseOrder = z.infer<typeof purchaseOrderSchema>;
export type RegisterReceipt = z.infer<typeof registerReceiptSchema>;
export type PurchaseOptions = z.infer<typeof purchaseOptionsResponseSchema>['data'];
export type PurchaseSupplierRef = z.infer<typeof purchaseSupplierRefSchema>;

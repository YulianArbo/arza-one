import { z } from 'zod';

import { moneySchema, periodSchema, positiveMoneySchema, signedMoneySchema } from './money.js';

// Conciliación bancaria, certificación de costos, cierre de periodo y exportación contable (B32,
// ficha 17.11). Un periodo cerrado no admite cambios; lo exportado coincide con lo registrado.

const idSchema = z.uuid();
const textSchema = (min: number, max: number) => z.string().trim().min(min).max(max);

/** Cuenta bancaria por su nombre corto; nunca el número completo (dato restringido). */
const accountLabelSchema = textSchema(3, 80).refine(
  (label) => !/\d{6,}/u.test(label.replaceAll(/[\s-]/gu, '')),
  'Escriba un nombre corto, como «Banco ahorros ···1234»; nunca el número completo de la cuenta.',
);

export const RECONCILIATION_STATUS = ['draft', 'reconciled'] as const;

export const reconciliationItemSchema = z.strictObject({
  description: textSchema(3, 200),
  amount: signedMoneySchema,
});

export const reconciliationSchema = z.object({
  id: idSchema,
  account: z.string(),
  period: periodSchema,
  book_balance: signedMoneySchema,
  bank_balance: signedMoneySchema,
  differences: z.array(reconciliationItemSchema),
  unexplained: signedMoneySchema,
  status: z.enum(RECONCILIATION_STATUS),
  version: z.number().int().positive(),
});

export const reconciliationListResponseSchema = z.object({ data: z.array(reconciliationSchema) });

export const saveReconciliationSchema = z.strictObject({
  account: accountLabelSchema,
  period: periodSchema,
  book_balance: signedMoneySchema,
  bank_balance: signedMoneySchema,
  differences: z.array(reconciliationItemSchema).max(200),
});

export const COST_PHASES = ['research', 'development', 'innovation'] as const;

export const costCertificationSchema = z.object({
  id: idSchema,
  code: z.string(),
  project: z.object({ id: idSchema, code: z.string(), name: z.string() }),
  period: periodSchema,
  hours: z.string(),
  amount: positiveMoneySchema,
  phase: z.enum(COST_PHASES),
  created_at: z.iso.datetime(),
});

export const costCertificationListResponseSchema = z.object({
  data: z.array(costCertificationSchema),
});

export const createCostCertificationSchema = z.strictObject({
  project_id: idSchema,
  period: periodSchema,
  amount: positiveMoneySchema,
  phase: z.enum(COST_PHASES),
});

export const certifiableHoursQuerySchema = z.strictObject({
  project_id: idSchema,
  period: periodSchema,
});

export const certifiableHoursResponseSchema = z.object({ data: z.object({ hours: z.string() }) });

export const certifiableProjectsResponseSchema = z.object({
  data: z.array(z.object({ id: idSchema, code: z.string(), name: z.string() })),
});

export const PERIOD_STATUS = ['open', 'closed'] as const;

export const financePeriodSchema = z.object({
  period: periodSchema,
  status: z.enum(PERIOD_STATUS),
  closable: z.boolean(),
  pending_expenses: z.number().int().nonnegative(),
  closed_at: z.iso.datetime().nullable(),
  batch_id: idSchema.nullable(),
});

export const financePeriodListResponseSchema = z.object({ data: z.array(financePeriodSchema) });

export const EXPORT_KINDS = ['preliminary', 'definitive'] as const;
export const EXPORT_ROW_TYPES = [
  'invoice',
  'credit_note',
  'payment',
  'expense',
  'petty_cash',
] as const;

/** Total de cada tipo de movimiento del archivo, para comprobar que cuadra con lo registrado. */
export const exportTotalsSchema = z.object(
  Object.fromEntries(EXPORT_ROW_TYPES.map((type) => [type, moneySchema])) as Record<
    (typeof EXPORT_ROW_TYPES)[number],
    typeof moneySchema
  >,
);

export const exportBatchSchema = z.object({
  id: idSchema,
  period: periodSchema,
  kind: z.enum(EXPORT_KINDS),
  row_count: z.number().int().nonnegative(),
  totals: exportTotalsSchema,
  checksum: z.string(),
  file_name: z.string(),
  exported_at: z.iso.datetime(),
});

export const exportBatchListResponseSchema = z.object({ data: z.array(exportBatchSchema) });

export const accountingExportRequestSchema = z.strictObject({ period: periodSchema });

/** Tope de filas de una exportación en el acto (decisión 8 del B32). */
export const ACCOUNTING_EXPORT_MAX_ROWS = 20_000;

export type Reconciliation = z.infer<typeof reconciliationSchema>;
export type ReconciliationItem = z.infer<typeof reconciliationItemSchema>;
export type SaveReconciliation = z.infer<typeof saveReconciliationSchema>;
export type CostCertification = z.infer<typeof costCertificationSchema>;
export type CreateCostCertification = z.infer<typeof createCostCertificationSchema>;
export type CertifiableHoursQuery = z.infer<typeof certifiableHoursQuerySchema>;
export type FinancePeriod = z.infer<typeof financePeriodSchema>;
export type ExportBatch = z.infer<typeof exportBatchSchema>;
export type ExportTotals = z.infer<typeof exportTotalsSchema>;
export type ExportRowType = (typeof EXPORT_ROW_TYPES)[number];
export type AccountingExportRequest = z.infer<typeof accountingExportRequestSchema>;

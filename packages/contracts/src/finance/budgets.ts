import { z } from 'zod';

import { moneySchema, positiveMoneySchema } from './money.js';

// Presupuesto por centro de costo (B32, ficha 17.11). Un presupuesto por año: se elabora en
// borrador, lo aprueba otra persona y desde ahí no se edita. Lo ejecutado se calcula con los gastos
// aprobados y los vales de caja menor del año; no se guarda dos veces.

export const BUDGET_STATUS = ['draft', 'approved'] as const;

const idSchema = z.uuid();
const yearSchema = z.number().int().min(2000).max(2100);
/** Código de un rubro del catálogo fin_expense_categories. */
export const financeCategorySchema = z
  .string()
  .trim()
  .regex(/^[A-Z][A-Z0-9_]{1,39}$/u, 'Elija un rubro del catálogo.');

export const costCenterRefSchema = z.object({ id: idSchema, code: z.string(), name: z.string() });
export const categoryRefSchema = z.object({ code: z.string(), label: z.string() });

export const budgetSummarySchema = z.object({
  id: idSchema,
  year: yearSchema,
  status: z.enum(BUDGET_STATUS),
  planned_total: moneySchema,
  line_count: z.number().int().nonnegative(),
  mine: z.boolean(),
  approved_at: z.iso.datetime().nullable(),
  version: z.number().int().positive(),
});

export const budgetLineSchema = z.object({
  id: idSchema,
  cost_center: costCenterRefSchema,
  category: categoryRefSchema,
  month: z.number().int().min(1).max(12),
  planned: positiveMoneySchema,
});

export const budgetDetailSchema = budgetSummarySchema.extend({
  lines: z.array(budgetLineSchema),
});

export const budgetExecutionRowSchema = z.object({
  cost_center: costCenterRefSchema,
  category: categoryRefSchema,
  planned: moneySchema,
  executed: moneySchema,
});

export const budgetExecutionSchema = z.object({
  year: yearSchema,
  rows: z.array(budgetExecutionRowSchema),
  by_cost_center: z.array(
    z.object({ cost_center: costCenterRefSchema, planned: moneySchema, executed: moneySchema }),
  ),
});

export const budgetListResponseSchema = z.object({ data: z.array(budgetSummarySchema) });
export const budgetDetailEnvelopeSchema = z.object({ data: budgetDetailSchema });
export const budgetExecutionEnvelopeSchema = z.object({ data: budgetExecutionSchema });

export const createBudgetSchema = z.strictObject({ year: yearSchema });

const budgetLineInputSchema = z.strictObject({
  cost_center_id: idSchema,
  category: financeCategorySchema,
  month: z.number().int().min(1).max(12),
  planned: positiveMoneySchema,
});

export const replaceBudgetLinesSchema = z.strictObject({
  lines: z
    .array(budgetLineInputSchema)
    .max(2000)
    .refine(
      (lines) =>
        new Set(
          lines.map((line) => `${line.cost_center_id}|${line.category}|${String(line.month)}`),
        ).size === lines.length,
      'Hay líneas repetidas: un centro de costo, un rubro y un mes van una sola vez.',
    ),
});

export type BudgetSummary = z.infer<typeof budgetSummarySchema>;
export type BudgetDetail = z.infer<typeof budgetDetailSchema>;
export type BudgetLine = z.infer<typeof budgetLineSchema>;
export type BudgetExecution = z.infer<typeof budgetExecutionSchema>;
export type CreateBudget = z.infer<typeof createBudgetSchema>;
export type ReplaceBudgetLines = z.infer<typeof replaceBudgetLinesSchema>;
export type CostCenterRef = z.infer<typeof costCenterRefSchema>;
export type CategoryRef = z.infer<typeof categoryRefSchema>;

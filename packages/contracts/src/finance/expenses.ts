import { z } from 'zod';

import { categoryRefSchema, costCenterRefSchema, financeCategorySchema } from './budgets.js';
import { positiveMoneySchema } from './money.js';

// Gastos y caja menor (B32, ficha 17.11). Un gasto lleva soporte y lo aprueba una persona distinta
// de quien lo registró. La caja menor es un libro de movimientos cuyo saldo nunca es negativo ni
// supera el fondo abierto.

const idSchema = z.uuid();
const dateSchema = z.iso.date();
const textSchema = (min: number, max: number) => z.string().trim().min(min).max(max);

export const EXPENSE_STATUS = ['pending', 'approved', 'rejected'] as const;

export const partyRefSchema = z.object({ id: idSchema, name: z.string() });

export const expenseSchema = z.object({
  id: idSchema,
  code: z.string(),
  expense_date: dateSchema,
  amount: positiveMoneySchema,
  category: categoryRefSchema,
  cost_center: costCenterRefSchema,
  supplier: partyRefSchema.nullable(),
  description: z.string(),
  support_file_id: idSchema,
  status: z.enum(EXPENSE_STATUS),
  decision_note: z.string().nullable(),
  mine: z.boolean(),
  version: z.number().int().positive(),
});

export const expenseListResponseSchema = z.object({ data: z.array(expenseSchema) });

export const createExpenseSchema = z.strictObject({
  expense_date: dateSchema,
  amount: positiveMoneySchema,
  category: financeCategorySchema,
  cost_center_id: idSchema,
  supplier_id: idSchema.nullable(),
  description: textSchema(3, 500),
  support_file_id: idSchema,
});

export const rejectExpenseSchema = z.strictObject({ reason: textSchema(3, 2000) });

export const PETTY_CASH_TYPES = ['opening', 'voucher', 'replenishment'] as const;

export const pettyCashMovementSchema = z.object({
  id: idSchema,
  code: z.string(),
  movement_date: dateSchema,
  type: z.enum(PETTY_CASH_TYPES),
  amount: positiveMoneySchema,
  concept: z.string(),
  cost_center: costCenterRefSchema.nullable(),
  category: categoryRefSchema.nullable(),
  support_file_id: idSchema.nullable(),
  balance: z.string(),
});

export const pettyCashResponseSchema = z.object({
  data: z.object({
    fund: z.string().nullable(),
    balance: z.string(),
    movements: z.array(pettyCashMovementSchema),
  }),
});

export const createPettyCashMovementSchema = z
  .strictObject({
    movement_date: dateSchema,
    type: z.enum(PETTY_CASH_TYPES),
    amount: positiveMoneySchema,
    concept: textSchema(3, 300),
    cost_center_id: idSchema.nullable(),
    category: financeCategorySchema.nullable(),
    support_file_id: idSchema.nullable(),
  })
  .refine(
    (movement) =>
      movement.type === 'voucher'
        ? movement.cost_center_id !== null && movement.category !== null
        : movement.cost_center_id === null && movement.category === null,
    {
      message: 'Un vale lleva centro de costo y rubro; la apertura y el reembolso no.',
      path: ['cost_center_id'],
    },
  );

export const financeOptionsResponseSchema = z.object({
  data: z.object({
    cost_centers: z.array(costCenterRefSchema),
    categories: z.array(categoryRefSchema),
    suppliers: z.array(partyRefSchema),
  }),
});

export type Expense = z.infer<typeof expenseSchema>;
export type CreateExpense = z.infer<typeof createExpenseSchema>;
export type RejectExpense = z.infer<typeof rejectExpenseSchema>;
export type PettyCashMovement = z.infer<typeof pettyCashMovementSchema>;
export type PettyCashResponse = z.infer<typeof pettyCashResponseSchema>;
export type CreatePettyCashMovement = z.infer<typeof createPettyCashMovementSchema>;
export type FinanceOptions = z.infer<typeof financeOptionsResponseSchema>['data'];
export type PartyRef = z.infer<typeof partyRefSchema>;

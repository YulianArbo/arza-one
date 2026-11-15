import { describe, expect, it } from 'vitest';

import {
  accountingExportRequestSchema,
  createCostCertificationSchema,
  saveReconciliationSchema,
} from './accounting.js';
import { replaceBudgetLinesSchema } from './budgets.js';
import { createExpenseSchema, createPettyCashMovementSchema } from './expenses.js';

const ID = '0195f3a2-7c41-7b9e-9d2a-3f4e5a6b7c8d';

function voucher(overrides: object = {}): object {
  return {
    movement_date: '2026-10-05',
    type: 'voucher',
    amount: '25000.00',
    concept: 'Taxi a reunión con cliente',
    cost_center_id: ID,
    category: 'TRANSPORT',
    support_file_id: null,
    ...overrides,
  };
}

describe('contratos de presupuesto, gastos y contabilidad B32', () => {
  it('no admite la misma línea de presupuesto dos veces', () => {
    const line = { cost_center_id: ID, category: 'SOFTWARE', month: 3, planned: '100.00' };
    expect(replaceBudgetLinesSchema.safeParse({ lines: [line] }).success).toBe(true);
    expect(replaceBudgetLinesSchema.safeParse({ lines: [line, line] }).success).toBe(false);
  });

  it('exige soporte y valor positivo en el gasto', () => {
    const expense = {
      expense_date: '2026-10-05',
      amount: '120000.50',
      category: 'SOFTWARE',
      cost_center_id: ID,
      supplier_id: null,
      description: 'Licencia de prueba',
      support_file_id: ID,
    };
    expect(createExpenseSchema.safeParse(expense).success).toBe(true);
    expect(createExpenseSchema.safeParse({ ...expense, amount: '0' }).success).toBe(false);
    expect(createExpenseSchema.safeParse({ ...expense, support_file_id: null }).success).toBe(
      false,
    );
  });
});

describe('contratos de caja menor y contabilidad B32', () => {
  it('un vale de caja lleva centro de costo y rubro; la apertura no', () => {
    expect(createPettyCashMovementSchema.safeParse(voucher()).success).toBe(true);
    expect(createPettyCashMovementSchema.safeParse(voucher({ category: null })).success).toBe(
      false,
    );
    const opening = voucher({ type: 'opening', cost_center_id: null, category: null });
    expect(createPettyCashMovementSchema.safeParse(opening).success).toBe(true);
    expect(createPettyCashMovementSchema.safeParse({ ...opening, category: 'X1' }).success).toBe(
      false,
    );
  });

  it('la cuenta bancaria se nombra sin su número completo', () => {
    const base = {
      period: '2026-10',
      book_balance: '1000.00',
      bank_balance: '900.00',
      differences: [{ description: 'Comisión bancaria', amount: '-100.00' }],
    };
    expect(
      saveReconciliationSchema.safeParse({ ...base, account: 'Banco ahorros ···1234' }).success,
    ).toBe(true);
    expect(
      saveReconciliationSchema.safeParse({ ...base, account: 'Cuenta 123-456789-01' }).success,
    ).toBe(false);
  });

  it('el periodo es un mes AAAA-MM', () => {
    expect(accountingExportRequestSchema.safeParse({ period: '2026-10' }).success).toBe(true);
    expect(accountingExportRequestSchema.safeParse({ period: '2026-13' }).success).toBe(false);
    expect(
      createCostCertificationSchema.safeParse({
        project_id: ID,
        period: '2026-1',
        amount: '10.00',
        phase: 'development',
      }).success,
    ).toBe(false);
  });
});

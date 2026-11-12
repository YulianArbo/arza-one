import type { PermissionCode } from '@arza/contracts';
import { screen, within } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { Screen } from '../../test-support/core-fixtures';
import {
  SESSION,
  json,
  mockApi,
  noContent,
  renderWithApi,
  type SentRequest,
} from '../../test-support/fake-api';
import { permissionsOf } from '../../test-support/party-fixtures';
import { BudgetsPanel } from './budgets-panel';
import { ExpensesPanel } from './expenses-panel';
import {
  BUDGET,
  BUDGET_DETAIL,
  BUDGET_ID,
  CENTER_ID,
  EXECUTION,
  EXPENSE,
  EXPENSE_ID,
  OPTIONS,
} from './ledger-fixtures';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace: vi.fn(), push: vi.fn() }),
  usePathname: () => '/app/finanzas',
}));

const BUDGET_ROUTES = {
  'GET /v1/auth/session': () => json(SESSION),
  'GET /v1/finance/options': () => json(OPTIONS),
  'GET /v1/finance/budgets': () => json({ data: [BUDGET] }),
  [`GET /v1/finance/budgets/${BUDGET_ID}`]: () => json({ data: BUDGET_DETAIL }),
  [`GET /v1/finance/budgets/${BUDGET_ID}/execution`]: () => json(EXECUTION),
  [`PUT /v1/finance/budgets/${BUDGET_ID}/lines`]: () => noContent(),
  [`POST /v1/finance/budgets/${BUDGET_ID}/approval`]: () => noContent(),
};

function serve(permissions: readonly PermissionCode[], extra: object = {}): SentRequest[] {
  return mockApi({
    ...BUDGET_ROUTES,
    'GET /v1/me/permissions': () => json(permissionsOf(permissions)),
    ...extra,
  });
}

beforeEach(() => {
  vi.stubGlobal('scrollTo', vi.fn());
});

afterEach(() => {
  vi.unstubAllGlobals();
});

async function openBudget(): Promise<void> {
  renderWithApi(
    <Screen>
      <BudgetsPanel />
    </Screen>,
  );
  await userEvent.click(await screen.findByRole('button', { name: 'Ver el presupuesto 2026' }));
  expect(await screen.findByText('Presupuesto 2026 · Borrador')).toBeVisible();
}

async function addLine(sent: SentRequest[]): Promise<void> {
  const form = screen.getByRole('form', { name: 'Agregar línea al presupuesto' });
  await userEvent.click(within(form).getByRole('button', { name: 'Agregar línea' }));
  expect(await within(form).findAllByText(/Valor planeado/u)).not.toHaveLength(0);
  await userEvent.selectOptions(within(form).getByLabelText('Centro de costo'), CENTER_ID);
  await userEvent.selectOptions(within(form).getByLabelText('Rubro'), 'SOFTWARE');
  await userEvent.selectOptions(within(form).getByLabelText('Mes'), '4');
  await userEvent.type(within(form).getByLabelText('Valor planeado'), '500000');
  await userEvent.click(within(form).getByRole('button', { name: 'Agregar línea' }));
  await vi.waitFor(() => {
    const put = sent.find((request) => request.method === 'PUT');
    expect(put?.body).toEqual({
      lines: [
        { cost_center_id: CENTER_ID, category: 'SOFTWARE', month: 3, planned: '1000000.00' },
        { cost_center_id: CENTER_ID, category: 'SOFTWARE', month: 4, planned: '500000' },
      ],
    });
  });
}

describe('pantalla de presupuesto (B32)', () => {
  it('agrega líneas, aprueba y muestra la ejecución por centro de costo', async () => {
    const sent = serve(['finance.budget.read', 'finance.budget.manage', 'finance.budget.approve']);
    await openBudget();
    expect(await screen.findByText('25,0 %')).toBeVisible();
    await addLine(sent);
    await userEvent.click(screen.getByRole('button', { name: 'Aprobar el presupuesto 2026' }));
    await vi.waitFor(() => {
      expect(sent.some((request) => request.path.endsWith('/approval'))).toBe(true);
    });
  });

  it('quien solo lee no ve formularios ni aprobación', async () => {
    serve(['finance.budget.read']);
    await openBudget();
    expect(screen.queryByRole('button', { name: 'Nuevo presupuesto' })).toBeNull();
    expect(screen.queryByRole('form', { name: 'Agregar línea al presupuesto' })).toBeNull();
    expect(screen.queryByRole('button', { name: /Aprobar/u })).toBeNull();
  });
});

function showExpenses(): void {
  renderWithApi(
    <Screen>
      <ExpensesPanel />
    </Screen>,
  );
}

describe('pantalla de gastos (B32)', () => {
  it('el colaborador ve solo sus gastos y el formulario exige los datos', async () => {
    const sent = serve(['finance.expense.manage'], {
      'GET /v1/finance/expenses/mine': () => json({ data: [] }),
    });
    showExpenses();
    expect(await screen.findByText('Aún no hay gastos')).toBeVisible();
    expect(sent.some((request) => request.path === '/v1/finance/expenses')).toBe(false);
    await userEvent.click(screen.getByRole('button', { name: 'Registrar gasto' }));
    const dialog = await screen.findByRole('dialog');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Registrar gasto' }));
    expect(await within(dialog).findByText('Adjunte el soporte.')).toBeVisible();
    expect(sent.some((request) => request.method === 'POST')).toBe(false);
  });

  it('Finanzas aprueba o rechaza el gasto de otra persona', async () => {
    const sent = serve(['finance.ledger.read', 'finance.expense.approve'], {
      'GET /v1/finance/expenses': () => json({ data: [EXPENSE] }),
      [`POST /v1/finance/expenses/${EXPENSE_ID}/approval`]: () => noContent(),
    });
    showExpenses();
    await userEvent.click(
      await screen.findByRole('button', { name: 'Aprobar el gasto GAS-2026-0001' }),
    );
    await vi.waitFor(() => {
      const approval = sent.find((request) => request.path.endsWith('/approval'));
      expect(approval?.headers['If-Match']).toBe('"1"');
    });
    expect(screen.getByRole('button', { name: 'Rechazar el gasto GAS-2026-0001' })).toBeVisible();
  });

  it('no ofrece aprobar un gasto propio', async () => {
    serve(['finance.ledger.read', 'finance.expense.approve'], {
      'GET /v1/finance/expenses': () => json({ data: [{ ...EXPENSE, mine: true }] }),
    });
    showExpenses();
    expect(await screen.findByText('Lo aprueba otra persona')).toBeVisible();
    expect(screen.queryByRole('button', { name: /Aprobar el gasto/u })).toBeNull();
  });
});

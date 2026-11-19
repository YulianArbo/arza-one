import type { PermissionCode } from '@arza/contracts';
import { screen, within } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import type { JSX } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { Screen } from '../../test-support/core-fixtures';
import {
  SESSION,
  json,
  mockApi,
  renderWithApi,
  type SentRequest,
} from '../../test-support/fake-api';
import { permissionsOf } from '../../test-support/party-fixtures';
import { CertificationsPanel } from './certifications-panel';
import { ClosingPanel } from './closing-panel';
import {
  BATCHES,
  BATCH_ID,
  CENTER_ID,
  OPTIONS,
  PERIODS,
  PETTY_CASH,
  PROJECT_ID,
  RECON_ID,
} from './ledger-fixtures';
import { PettyCashPanel } from './petty-cash-panel';
import { ReconciliationsPanel } from './reconciliations-panel';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace: vi.fn(), push: vi.fn() }),
  usePathname: () => '/app/finanzas',
}));

const FINANCE: readonly PermissionCode[] = [
  'finance.ledger.read',
  'finance.petty_cash.manage',
  'finance.reconciliation.manage',
  'finance.cost_certification.manage',
  'finance.period.close',
  'finance.export',
];

function serve(routes: object, permissions: readonly PermissionCode[] = FINANCE): SentRequest[] {
  return mockApi({
    'GET /v1/auth/session': () => json(SESSION),
    'GET /v1/me/permissions': () => json(permissionsOf(permissions)),
    'GET /v1/finance/options': () => json(OPTIONS),
    ...routes,
  });
}

function show(panel: JSX.Element): void {
  renderWithApi(<Screen>{panel}</Screen>);
}

beforeEach(() => {
  vi.stubGlobal('scrollTo', vi.fn());
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('caja menor (B32)', () => {
  it('muestra el saldo y pide centro de costo y rubro solo en un vale', async () => {
    const sent = serve({
      'GET /v1/finance/petty-cash': () => json(PETTY_CASH),
      'POST /v1/finance/petty-cash/movements': () => json({ id: CENTER_ID }, 201),
    });
    show(<PettyCashPanel />);
    expect(await screen.findByText('Taxi a reunión')).toBeVisible();
    await userEvent.click(screen.getByRole('button', { name: 'Registrar movimiento' }));
    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).queryByLabelText('Centro de costo')).toBeNull();
    await userEvent.selectOptions(within(dialog).getByLabelText('Tipo'), 'voucher');
    await userEvent.selectOptions(within(dialog).getByLabelText('Centro de costo'), CENTER_ID);
    await userEvent.selectOptions(within(dialog).getByLabelText('Rubro'), 'TRANSPORT');
    await userEvent.type(within(dialog).getByLabelText('Fecha'), '2026-11-06');
    await userEvent.type(within(dialog).getByLabelText('Valor'), '20000');
    await userEvent.type(within(dialog).getByLabelText('Concepto'), 'Domicilio');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Registrar movimiento' }));
    await vi.waitFor(() => {
      expect(sent.find((request) => request.method === 'POST')?.body).toMatchObject({
        type: 'voucher',
        cost_center_id: CENTER_ID,
        category: 'TRANSPORT',
      });
    });
  });
});

describe('conciliación bancaria (B32)', () => {
  it('registra la conciliación con sus partidas y no acepta el número completo', async () => {
    const sent = serve({
      'GET /v1/finance/bank-reconciliations': () => json({ data: [] }),
      'POST /v1/finance/bank-reconciliations': () => json({ id: RECON_ID }, 201),
    });
    show(<ReconciliationsPanel />);
    await userEvent.click(await screen.findByRole('button', { name: 'Nueva conciliación' }));
    const dialog = await screen.findByRole('dialog');
    await userEvent.type(within(dialog).getByLabelText('Cuenta'), 'Cuenta 1234567890');
    await userEvent.type(within(dialog).getByLabelText('Mes'), '2026-10');
    await userEvent.type(within(dialog).getByLabelText('Saldo en libros'), '1000');
    await userEvent.type(within(dialog).getByLabelText('Saldo del banco'), '990');
    await userEvent.type(within(dialog).getByLabelText('Partida'), 'Comisión');
    await userEvent.type(within(dialog).getByLabelText('Valor'), '-10');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Agregar partida' }));
    await userEvent.click(within(dialog).getByRole('button', { name: 'Guardar conciliación' }));
    expect(
      (await within(dialog).findAllByText(/nunca el número completo/u)).length,
    ).toBeGreaterThan(0);
    await userEvent.clear(within(dialog).getByLabelText('Cuenta'));
    await userEvent.type(within(dialog).getByLabelText('Cuenta'), 'Banco ahorros ···1234');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Guardar conciliación' }));
    await vi.waitFor(() => {
      expect(sent.find((request) => request.method === 'POST')?.body).toMatchObject({
        differences: [{ description: 'Comisión', amount: '-10' }],
      });
    });
  });
});

describe('certificación de costos (B32)', () => {
  it('muestra las horas aprobadas del proyecto en el mes', async () => {
    serve({
      'GET /v1/finance/cost-certifications': () => json({ data: [] }),
      'GET /v1/finance/cost-certifications/projects': () =>
        json({ data: [{ id: PROJECT_ID, code: 'PRY-2026-0001', name: 'Portal' }] }),
      'GET /v1/finance/cost-certifications/hours': () => json({ data: { hours: '12.50' } }),
    });
    show(<CertificationsPanel />);
    await userEvent.click(await screen.findByRole('button', { name: 'Nueva certificación' }));
    const dialog = await screen.findByRole('dialog');
    await userEvent.selectOptions(await within(dialog).findByLabelText('Proyecto'), PROJECT_ID);
    await userEvent.type(within(dialog).getByLabelText('Mes'), '2026-10');
    expect(await within(dialog).findByText('Horas aprobadas en el mes: 12,50')).toBeVisible();
  });
});

describe('cierre y exportación (B32)', () => {
  it('cierra un mes terminado y descarga el archivo del mes', async () => {
    const createObjectURL = vi.fn(() => 'blob:contabilidad');
    vi.stubGlobal('URL', Object.assign(URL, { createObjectURL, revokeObjectURL: vi.fn() }));
    const sent = serve({
      'GET /v1/finance/periods': () => json(PERIODS),
      'GET /v1/finance/exports': () => json(BATCHES),
      'POST /v1/finance/periods/close': () => json({ id: BATCH_ID }, 201),
      'POST /v1/finance/exports/accounting': () =>
        new Response('fecha;tipo\r\n', {
          headers: {
            'Content-Disposition': 'attachment; filename="contabilidad-2026-11-preliminar.csv"',
          },
        }),
    });
    show(<ClosingPanel />);
    expect(await screen.findByText('Definitivo')).toBeVisible();
    expect(screen.queryByRole('button', { name: 'Cerrar mes 11/2026' })).toBeNull();
    await userEvent.click(screen.getByRole('button', { name: 'Cerrar mes 10/2026' }));
    await vi.waitFor(() => {
      expect(sent.find((request) => request.path.endsWith('/close'))?.body).toEqual({
        period: '2026-10',
      });
    });
    await userEvent.click(
      screen.getByRole('button', { name: 'Exportar preliminar del mes 11/2026' }),
    );
    expect(
      await screen.findByText('Descargamos contabilidad-2026-11-preliminar.csv.'),
    ).toBeVisible();
    expect(createObjectURL).toHaveBeenCalledOnce();
  });

  it('quien solo lee no cierra ni exporta', async () => {
    serve({ 'GET /v1/finance/periods': () => json(PERIODS) }, ['finance.ledger.read']);
    show(<ClosingPanel />);
    expect(await screen.findByText('10/2026')).toBeVisible();
    expect(screen.queryByRole('button', { name: /Cerrar mes/u })).toBeNull();
    expect(screen.queryByRole('button', { name: /Exportar/u })).toBeNull();
  });
});

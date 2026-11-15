import { screen, within } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { Screen } from '../../test-support/core-fixtures';
import { SESSION, json, mockApi, noContent, renderWithApi } from '../../test-support/fake-api';
import { permissionsOf } from '../../test-support/party-fixtures';
import { FinanceHome } from './finance-home';
import { TaxParametersPanel } from './tax-parameters-panel';

// Finanzas en B23: la portada con los parámetros tributarios y «Disponible pronto», y el registro
// de una tarifa nueva por el Contador.

vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace: vi.fn(), push: vi.fn() }),
  usePathname: () => '/app/finanzas',
}));

beforeEach(() => {
  vi.stubGlobal('scrollTo', vi.fn());
});

afterEach(() => {
  vi.unstubAllGlobals();
});

const ACCOUNTANT = permissionsOf([
  'finance.tax_parameter.manage',
  'finance.invoice.read',
  'finance.ledger.read',
]);

const VERSION = {
  id: '01999a00-0000-7000-8000-0000000e0001',
  rate: '19.00',
  valid_from: '2026-01-01',
  valid_to: null,
  legal_basis: 'Estatuto Tributario, art. 468. Por validar por el Contador.',
  created_at: '2026-01-01T05:00:00.000Z',
  created_by: null,
};

const TAX = { key: 'IVA_GENERAL', label: 'IVA general', current: VERSION, scheduled: null };

function serveTaxes(permissions: object) {
  return mockApi({
    'GET /v1/auth/session': () => json(SESSION),
    'GET /v1/me/permissions': () => json(permissions),
    'GET /v1/finance/tax-parameters': () => json({ data: [TAX] }),
    'GET /v1/finance/tax-parameters/IVA_GENERAL/history': () =>
      json({ key: 'IVA_GENERAL', label: 'IVA general', data: [VERSION] }),
    'POST /v1/finance/tax-parameters/versions': () => noContent(),
  });
}

describe('finanzas', () => {
  it('la portada enlaza parámetros y facturación, y deja clara la cartera pendiente', async () => {
    serveTaxes(ACCOUNTANT);
    renderWithApi(
      <Screen>
        <FinanceHome />
      </Screen>,
    );
    const link = await screen.findByRole('link', { name: /Parámetros tributarios/u });
    expect(link).toHaveAttribute('href', '/app/finanzas/parametros-tributarios');
    const invoices = screen.getByRole('link', { name: /Facturas y recaudos/u });
    expect(invoices).toHaveAttribute('href', '/app/finanzas/facturas');
    const closing = screen.getByRole('link', { name: /Cierre y exportación contable/u });
    expect(closing).toHaveAttribute('href', '/app/finanzas/cierre');
    expect(screen.queryByRole('link', { name: /Presupuesto/u })).toBeNull();
    expect(screen.getByText('Cartera por edades: disponible pronto')).toBeVisible();
  });
});

describe('finanzas: parámetros tributarios', () => {
  it('muestra la tarifa vigente con su historial y registra un impuesto nuevo', async () => {
    const sent = serveTaxes(ACCOUNTANT);
    renderWithApi(
      <Screen>
        <TaxParametersPanel />
      </Screen>,
    );
    expect(await screen.findByText(/Hoy: 19 %, desde el 01\/01\/2026/u)).toBeVisible();
    expect(await screen.findByText(/art\. 468/u)).toBeVisible();
    await userEvent.click(screen.getByRole('button', { name: 'Registrar una tarifa' }));
    const dialog = await screen.findByRole('dialog');
    await userEvent.selectOptions(within(dialog).getByLabelText('Impuesto'), '__nuevo__');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Registrar' }));
    expect(within(dialog).getByText('Escriba el nombre del impuesto.')).toBeVisible();
    await userEvent.type(within(dialog).getByLabelText('Clave'), 'iva_reducido');
    await userEvent.type(within(dialog).getByLabelText('Nombre'), 'IVA reducido');
    await userEvent.type(within(dialog).getByLabelText('Tarifa en %'), '5');
    const basis = within(dialog).getByLabelText('Fundamento legal');
    await userEvent.type(basis, 'Estatuto Tributario, art. 468-1.');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Registrar' }));
    await vi.waitFor(() => {
      expect(sent.find((request) => request.method === 'POST')?.body).toMatchObject({
        key: 'IVA_REDUCIDO',
        label: 'IVA reducido',
        rate: '5',
      });
    });
  });
});

const SCHEDULED = {
  ...VERSION,
  id: '01999a00-0000-7000-8000-0000000e0002',
  rate: '20.00',
  valid_from: '2027-01-01',
};

const CLOSED = {
  ...VERSION,
  valid_to: '2026-12-31',
  created_by: { id: VERSION.id, name: 'Carla Contadora' },
};

function serveScheduled() {
  return mockApi({
    'GET /v1/auth/session': () => json(SESSION),
    'GET /v1/me/permissions': () => json(ACCOUNTANT),
    'GET /v1/finance/tax-parameters': () =>
      json({ data: [{ ...TAX, current: null, scheduled: SCHEDULED }] }),
    'GET /v1/finance/tax-parameters/IVA_GENERAL/history': () =>
      json({ key: 'IVA_GENERAL', label: 'IVA general', data: [CLOSED] }),
    'POST /v1/finance/tax-parameters/versions': () => noContent(),
  });
}

describe('finanzas: tarifas programadas', () => {
  it('muestra el cambio programado y registra una tarifa nueva de un impuesto existente', async () => {
    const sent = serveScheduled();
    renderWithApi(
      <Screen>
        <TaxParametersPanel />
      </Screen>,
    );
    expect(await screen.findByText(/Sin tarifa vigente hoy/u)).toBeVisible();
    expect(screen.getByText(/Cambio programado: 20 % desde el 01\/01\/2027/u)).toBeVisible();
    expect(await screen.findByText('Carla Contadora')).toBeVisible();
    await userEvent.click(screen.getByRole('button', { name: 'Registrar una tarifa' }));
    const dialog = await screen.findByRole('dialog');
    await userEvent.type(within(dialog).getByLabelText('Tarifa en %'), '19');
    const basis = within(dialog).getByLabelText('Fundamento legal');
    await userEvent.type(basis, 'Estatuto Tributario, art. 468.');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Registrar' }));
    await vi.waitFor(() => {
      expect(sent.find((request) => request.method === 'POST')?.body).toMatchObject({
        key: 'IVA_GENERAL',
        label: null,
        rate: '19',
      });
    });
  });
});

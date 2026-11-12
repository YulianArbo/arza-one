import { screen, within } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { CORE_ADMIN, Screen, serveCore } from '../../test-support/core-fixtures';
import { json, noContent, renderWithApi } from '../../test-support/fake-api';
import { ParametersPanel, describeValue } from './parameters-panel';

// Topes de aprobación de compras (B33, decisión 2) en Administración › Parámetros: se muestran en
// palabras y se programan como cualquier parámetro con vigencia.

vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace: vi.fn(), push: vi.fn() }),
  usePathname: () => '/app/administracion/parametros',
}));

beforeEach(() => {
  vi.stubGlobal('scrollTo', vi.fn());
});

afterEach(() => {
  vi.unstubAllGlobals();
});

const TIERS = {
  low_limit: '1000000.00',
  mid_limit: '10000000.00',
  quotes_low: 1,
  quotes_mid: 2,
  quotes_high: 3,
};

const PARAMETER = {
  key: 'purchase.approval_tiers',
  label: 'Topes de aprobación de compras',
  description: 'Topes por monto de una compra.',
  current: {
    id: '01999a00-0000-7000-8000-0000000d0201',
    value: TIERS,
    valid_from: '2026-01-01',
    valid_to: null,
    created_at: '2026-01-01T05:00:00.000Z',
    created_by: null,
  },
  scheduled: null,
};

describe('topes de compras en palabras', () => {
  it('dice cuántas cotizaciones exige cada tramo y quién aprueba el alto', () => {
    const text = describeValue(TIERS);
    expect(text).toMatch(/Hasta \$\s1\.000\.000: 1 cotización/u);
    expect(text).toMatch(/Hasta \$\s10\.000\.000: 2 cotizaciones/u);
    expect(text).toContain('Por encima: 3 cotizaciones y aprueba la Dirección.');
  });
});

describe('programar topes nuevos', () => {
  it('avisa si los topes están desordenados y guarda los valores', async () => {
    const sent = serveCore(CORE_ADMIN, {
      'GET /v1/parameters': () => json({ data: [PARAMETER] }),
      'POST /v1/parameters/purchase.approval_tiers/versions': () => noContent(),
    });
    renderWithApi(
      <Screen>
        <ParametersPanel />
      </Screen>,
    );
    await userEvent.click(await screen.findByRole('button', { name: 'Programar un cambio' }));
    const dialog = await screen.findByRole('dialog');
    const mid = within(dialog).getByLabelText('Tope del tramo medio, en pesos');
    await userEvent.clear(mid);
    await userEvent.type(mid, '500000');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Programar el cambio' }));
    expect(
      within(dialog).getByText('El tope medio debe ser mayor que el tope bajo.'),
    ).toBeVisible();
    await userEvent.clear(mid);
    await userEvent.type(mid, '20000000');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Programar el cambio' }));
    await vi.waitFor(() => {
      expect(sent.find((r) => r.method === 'POST')?.body).toMatchObject({
        value: { ...TIERS, mid_limit: '20000000' },
      });
    });
  });
});

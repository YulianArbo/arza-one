import { screen, within } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { CORE_ADMIN, Screen, serveCore } from '../../test-support/core-fixtures';
import { json, noContent, renderWithApi } from '../../test-support/fake-api';
import { ParametersPanel, describeValue } from './parameters-panel';

// Tope de descuento sin aprobación (B23) en Administración › Parámetros: se muestra en palabras y
// se programa como cualquier parámetro con vigencia.

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

const CAP_VERSION = {
  id: '01999a00-0000-7000-8000-0000000d0001',
  value: { percent: '10.00' },
  valid_from: '2026-01-01',
  valid_to: null,
  created_at: '2026-01-01T05:00:00.000Z',
  created_by: null,
};

const CAP = {
  key: 'crm.discount_cap',
  label: 'Tope de descuento sin aprobación',
  description: 'Descuento máximo por ítem que una cotización lleva sin aprobación de la Dirección.',
  current: CAP_VERSION,
  scheduled: null,
};

describe('tope de descuento', () => {
  it('se describe en palabras', () => {
    expect(describeValue({ percent: '10.00' })).toBe(
      'Hasta 10 % por ítem sin aprobación de la Dirección.',
    );
    expect(describeValue({ percent: '7.50' })).toBe(
      'Hasta 7,50 % por ítem sin aprobación de la Dirección.',
    );
  });

  it('programa un tope nuevo y avisa si el porcentaje no es válido', async () => {
    const sent = serveCore(CORE_ADMIN, {
      'GET /v1/parameters': () => json({ data: [CAP] }),
      'GET /v1/parameters/crm.discount_cap/history': () =>
        json({ key: CAP.key, label: CAP.label, data: [CAP_VERSION] }),
      'POST /v1/parameters/crm.discount_cap/versions': () => noContent(),
    });
    renderWithApi(
      <Screen>
        <ParametersPanel />
      </Screen>,
    );
    expect(await screen.findByText(/Hasta 10 % por ítem/u)).toBeVisible();
    await userEvent.click(await screen.findByRole('button', { name: 'Programar un cambio' }));
    const dialog = await screen.findByRole('dialog');
    const field = within(dialog).getByLabelText('Tope de descuento por ítem, en %');
    await userEvent.clear(field);
    await userEvent.type(field, '150');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Programar el cambio' }));
    expect(within(dialog).getByText('El tope no puede pasar de 100 %.')).toBeVisible();
    await userEvent.clear(field);
    await userEvent.type(field, '12,5');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Programar el cambio' }));
    await vi.waitFor(() => {
      const request = sent.find((item) => item.method === 'POST');
      expect(request?.body).toMatchObject({ value: { percent: '12.5' } });
    });
  });
});

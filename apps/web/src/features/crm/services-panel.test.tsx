import { screen, within } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { Screen } from '../../test-support/core-fixtures';
import { json, noContent, renderWithApi } from '../../test-support/fake-api';
import { QUOTER, QUOTE_READER, SERVICE_ID, serveQuotes } from '../../test-support/quote-fixtures';
import { ServicesPanel } from './services-panel';

// Portafolio de servicios (B23): lista con tarifa e impuesto; quien administra el portafolio agrega
// y edita servicios, y quien solo lee no.

vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace: vi.fn(), push: vi.fn() }),
  usePathname: () => '/app/comercial/portafolio',
}));

beforeEach(() => {
  vi.stubGlobal('scrollTo', vi.fn());
});

afterEach(() => {
  vi.unstubAllGlobals();
});

function renderPanel(): void {
  renderWithApi(
    <Screen>
      <ServicesPanel />
    </Screen>,
  );
}

describe('portafolio', () => {
  it('agrega un servicio con su tarifa y su impuesto', async () => {
    const sent = serveQuotes(QUOTER, {
      'POST /v1/crm/services': () => json({ id: SERVICE_ID }, 201),
    });
    renderPanel();
    expect(await screen.findByText('Desarrollo a la medida')).toBeVisible();
    expect(screen.getByText('IVA general')).toBeVisible();
    await userEvent.click(await screen.findByRole('button', { name: 'Agregar servicio' }));
    const dialog = await screen.findByRole('dialog');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Guardar' }));
    expect(within(dialog).getAllByText('Escriba al menos tres letras.')[0]).toBeVisible();
    await userEvent.type(within(dialog).getByLabelText('Nombre'), 'Soporte mensual');
    await userEvent.selectOptions(within(dialog).getByLabelText('Unidad en que se cobra'), 'month');
    const price = within(dialog).getByLabelText('Tarifa en pesos, antes de impuestos');
    await userEvent.type(price, '2500000');
    await userEvent.selectOptions(within(dialog).getByLabelText('Impuesto'), 'IVA_EXENTO');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Guardar' }));
    await vi.waitFor(() => {
      expect(sent.find((request) => request.method === 'POST')?.body).toEqual({
        name: 'Soporte mensual',
        description: null,
        unit: 'month',
        base_price: '2500000',
        tax_key: 'IVA_EXENTO',
        is_active: true,
      });
    });
  });
});

describe('portafolio: editar y leer', () => {
  it('edita un servicio y lo desactiva con la versión que se vio', async () => {
    const sent = serveQuotes(QUOTER, {
      [`PUT /v1/crm/services/${SERVICE_ID}`]: () => noContent(),
    });
    renderPanel();
    const edit = await screen.findByRole('button', { name: 'Editar Desarrollo a la medida' });
    await userEvent.click(edit);
    const dialog = await screen.findByRole('dialog');
    await userEvent.click(within(dialog).getByLabelText(/Activo/u));
    await userEvent.click(within(dialog).getByRole('button', { name: 'Guardar' }));
    await vi.waitFor(() => {
      const request = sent.find((item) => item.method === 'PUT');
      expect(request?.body).toMatchObject({ is_active: false });
      expect(request?.headers['If-Match']).toBe('"1"');
    });
  });

  it('quien solo lee ve el portafolio sin botones', async () => {
    serveQuotes(QUOTE_READER);
    renderPanel();
    expect(await screen.findByText('Desarrollo a la medida')).toBeVisible();
    expect(screen.queryByRole('button', { name: 'Agregar servicio' })).toBeNull();
  });
});

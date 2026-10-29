import { screen } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { apiError, json, mockApi, noContent, renderWithApi } from '../../test-support/fake-api';
import { ClientQuote } from './client-quote';

// La página del cliente (B23, anexo D): lee la llave del enlace, muestra la cotización y deja
// aceptarla o rechazarla una sola vez. Una vencida no se puede aceptar.

const TOKEN = 'A'.repeat(43);

const QUOTE = {
  company: { name: 'ARZA TECH S.A.S.', tax_id: '900000000-1' },
  code: 'COT-2026-0001',
  version_number: 2,
  party_name: 'Comercializadora Andina S.A.S.',
  issued_at: '2026-10-28T15:00:00.000Z',
  valid_until: '2026-11-30',
  state: 'open',
  conditions: { payment_terms: 'Contado', delivery_terms: 'Un mes', warranty: null },
  notes: null,
  items: [
    {
      position: 1,
      description: 'Desarrollo a la medida',
      unit: 'hour',
      quantity: '10.00',
      unit_price: '85000.00',
      discount_percent: '5.00',
      tax_rate: '19.00',
      line_total: '960925.00',
    },
  ],
  subtotal: '850000.00',
  discount_total: '42500.00',
  tax_total: '153425.00',
  total: '960925.00',
  taxes: [{ tax_rate: '19.00', base: '807500.00', tax: '153425.00' }],
  responded_at: null,
  responded_by: null,
};

beforeEach(() => {
  vi.stubGlobal('scrollTo', vi.fn());
  window.history.replaceState(null, '', `/cotizacion#token=${TOKEN}`);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

function serve(state = 'open', extra: Record<string, () => Response> = {}) {
  return mockApi({
    'POST /v1/public/quotes/view': () => json({ ...QUOTE, state }),
    'POST /v1/public/quotes/accept': () => noContent(),
    'POST /v1/public/quotes/reject': () => noContent(),
    ...extra,
  });
}

describe('la cotización del cliente', () => {
  it('quita la llave de la dirección y la manda en el cuerpo de la petición', async () => {
    const sent = serve();
    renderWithApi(<ClientQuote />);
    expect(
      await screen.findByRole('heading', { name: 'Cotización COT-2026-0001 · versión 2' }),
    ).toBeVisible();
    expect(window.location.hash).toBe('');
    expect(sent[0]?.body).toEqual({ token: TOKEN });
    expect(screen.getByText('Desarrollo a la medida')).toBeVisible();
    expect(screen.getByText(/Puede aceptarla o rechazarla hasta el 30\/11\/2026/u)).toBeVisible();
  });
});

describe('la cotización del cliente: respuestas', () => {
  it('aceptar pide el nombre y la casilla, y envía la respuesta', async () => {
    const sent = serve();
    renderWithApi(<ClientQuote />);
    const accept = await screen.findByRole('button', { name: 'Aceptar la cotización' });
    await userEvent.click(accept);
    expect(screen.getByText('Escriba su nombre completo.')).toBeVisible();
    expect(screen.getByText('Marque la casilla para aceptar la cotización.')).toBeVisible();
    await userEvent.type(screen.getByLabelText('Su nombre completo'), 'Clara Cliente');
    await userEvent.click(screen.getByLabelText(/Acepto esta cotización/u));
    await userEvent.click(accept);
    await vi.waitFor(() => {
      expect(sent.find((request) => request.path.endsWith('/accept'))?.body).toEqual({
        token: TOKEN,
        accepted_by_name: 'Clara Cliente',
        accept: true,
      });
    });
  });

  it('rechazar con el motivo opcional', async () => {
    const sent = serve();
    renderWithApi(<ClientQuote />);
    await userEvent.click(await screen.findByRole('button', { name: 'Rechazar la cotización' }));
    await userEvent.type(screen.getByLabelText(/Por qué la rechaza/u), 'Muy costosa');
    await userEvent.click(screen.getByRole('button', { name: 'Confirmar el rechazo' }));
    await vi.waitFor(() => {
      expect(sent.find((request) => request.path.endsWith('/reject'))?.body).toEqual({
        token: TOKEN,
        reason: 'Muy costosa',
      });
    });
  });
});

describe('la cotización del cliente: estados', () => {
  it('una vencida explica que ya no se acepta y no ofrece responder', async () => {
    serve('expired');
    renderWithApi(<ClientQuote />);
    expect(
      await screen.findByText(/venció el 30\/11\/2026 y ya no puede aceptarse/u),
    ).toBeVisible();
    expect(screen.queryByRole('button', { name: 'Aceptar la cotización' })).toBeNull();
  });

  it('un enlace que no sirve muestra el mensaje de la API', async () => {
    serve('open', {
      'POST /v1/public/quotes/view': () =>
        apiError(404, 'CRM_QUOTE_LINK_INVALID', 'El enlace no es válido.'),
    });
    renderWithApi(<ClientQuote />);
    expect(await screen.findByText('El enlace no es válido.')).toBeVisible();
  });

  it('sin llave en el enlace pide abrirlo tal como llegó', async () => {
    // Otra dirección equivale a cargar la página desde cero: la llave leída antes no aplica.
    window.history.replaceState(null, '', '/cotizacion/sin-llave');
    serve();
    renderWithApi(<ClientQuote />);
    expect(await screen.findByText(/El enlace no está completo/u)).toBeVisible();
  });
});

import { screen } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { Screen } from '../../test-support/core-fixtures';
import { json, renderWithApi } from '../../test-support/fake-api';
import {
  DIRECTOR,
  QUOTER,
  QUOTE_ID,
  QUOTE_READER,
  quoteDetail,
  serveQuotes,
} from '../../test-support/quote-fixtures';
import { stateMessage } from '../client-quote/client-quote-parts';
import { QuoteDetailPanel } from './quote-detail';
import { emptyItem, initialValues, itemFromService, problemsOf } from './quote-form-values';

// Estados de la cotización (B23): lo que dice la ficha en cada uno, lo que ve el cliente, la
// descarga del PDF y las validaciones de cada ítem del asistente.

vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace: vi.fn(), push: vi.fn(), back: vi.fn() }),
  usePathname: () => '/app/comercial/cotizaciones',
}));

beforeEach(() => {
  vi.stubGlobal('scrollTo', vi.fn());
});

afterEach(() => {
  vi.unstubAllGlobals();
});

function renderWith(permissions: object, overrides: object): void {
  serveQuotes(permissions, {
    [`GET /v1/crm/quotes/${QUOTE_ID}`]: () => json(quoteDetail(overrides)),
  });
  renderWithApi(
    <Screen>
      <QuoteDetailPanel id={QUOTE_ID} />
    </Screen>,
  );
}

const SENT = {
  status: 'sent',
  sent_at: '2026-10-28T16:00:00.000Z',
  recipient: { name: 'Clara Cliente', email: 'clara@example.com' },
  pdf: { status: 'ready', file_name: 'COT-2026-0001-v2.pdf' },
};

describe('ficha según el estado', () => {
  it('enviada: a quién, cuándo y el aviso mientras sale el correo', async () => {
    renderWith(QUOTE_READER, SENT);
    expect(await screen.findByText('Enviando el correo con el enlace al cliente…')).toBeVisible();
    expect(screen.getByText('Clara Cliente · clara@example.com')).toBeVisible();
  });

  it('reemplazada, con garantía, notas y la decisión de la Dirección', async () => {
    renderWith(QUOTE_READER, {
      status: 'superseded',
      conditions: { payment_terms: 'Contado', delivery_terms: 'Un mes', warranty: 'Seis meses' },
      notes: 'Incluye capacitación.',
      approval: {
        required: true,
        largest_discount: '15.00',
        discount_cap: '10.00',
        decided_by: DIRECTOR,
        decided_at: '2026-10-28T16:00:00.000Z',
        note: null,
      },
    });
    expect(await screen.findByText(/fue reemplazada por una más reciente/u)).toBeVisible();
    expect(screen.getByText('Seis meses')).toBeVisible();
    expect(screen.getByText('Incluye capacitación.')).toBeVisible();
    expect(screen.getByText(/Diego Director/u)).toBeVisible();
  });
});

describe('ficha según el estado (2)', () => {
  it('rechazada: la evidencia con el motivo y un ítem libre sin código', async () => {
    renderWith(QUOTE_READER, {
      status: 'rejected',
      items: [
        {
          ...(quoteDetail() as { items: object[] }).items[0],
          service: null,
          description: 'Ítem libre',
        },
      ],
      response: {
        decision: 'rejected',
        at: '2026-10-29T15:00:00.000Z',
        by_name: null,
        reason: 'Muy costosa',
        ip: null,
        user_agent: null,
        pdf_sha256: null,
      },
    });
    expect(await screen.findByText('Rechazada', { selector: 'dd' })).toBeVisible();
    expect(screen.getByText('Muy costosa')).toBeVisible();
    expect(screen.getByText('Ítem libre')).toBeVisible();
  });
});

describe('ficha según el estado (3)', () => {
  it('en aprobación, quien no aprueba solo ve el aviso', async () => {
    renderWith(QUOTER, {
      status: 'in_approval',
      approval: {
        required: true,
        largest_discount: '15.00',
        discount_cap: null,
        decided_by: null,
        decided_at: null,
        note: null,
      },
    });
    expect(await screen.findByText(/pasa el tope de 0 %/u)).toBeVisible();
    expect(screen.queryByRole('button', { name: 'Aprobar' })).toBeNull();
  });
});

describe('descargar el PDF desde la ficha', () => {
  it('pide el enlace temporal y entrega el archivo', async () => {
    const link = 'https://api.arza.test/v1/files/downloads/llave';
    const sent = serveQuotes(QUOTER, {
      [`GET /v1/crm/quotes/${QUOTE_ID}`]: () => json(quoteDetail(SENT)),
      [`POST /v1/crm/quotes/${QUOTE_ID}/pdf`]: () =>
        json({ url: link, expires_at: '2026-10-29T15:05:00.000Z' }, 201),
      'GET /v1/files/downloads/llave': () => new Response('%PDF-1.7', { status: 200 }),
    });
    vi.stubGlobal(
      'URL',
      Object.assign(URL, { createObjectURL: vi.fn(() => 'blob:x'), revokeObjectURL: vi.fn() }),
    );
    renderWithApi(
      <Screen>
        <QuoteDetailPanel id={QUOTE_ID} />
      </Screen>,
    );
    await userEvent.click(await screen.findByRole('button', { name: 'Descargar PDF' }));
    await vi.waitFor(() => {
      expect(sent.some((request) => request.path.endsWith('/pdf'))).toBe(true);
    });
  });
});

describe('lo que ve el cliente en cada estado', () => {
  const base = {
    company: { name: 'ARZA TECH S.A.S.', tax_id: null },
    code: 'COT-2026-0001',
    version_number: 1,
    party_name: 'Cliente',
    issued_at: '2026-10-28T15:00:00.000Z',
    valid_until: '2026-11-30',
    conditions: { payment_terms: 'Contado', delivery_terms: 'Un mes', warranty: null },
    notes: null,
    items: [],
    subtotal: '0.00',
    discount_total: '0.00',
    tax_total: '0.00',
    total: '0.00',
    taxes: [],
    responded_at: '2026-10-29T15:00:00.000Z',
    responded_by: 'Clara Cliente',
  };

  it('aceptada, rechazada y reemplazada tienen su mensaje', () => {
    expect(stateMessage({ ...base, state: 'accepted' })).toMatch(/La aceptó Clara Cliente/u);
    expect(stateMessage({ ...base, state: 'rejected' })).toMatch(/Usted rechazó/u);
    expect(stateMessage({ ...base, state: 'replaced' })).toMatch(/versión más reciente/u);
  });
});

describe('ítems del asistente', () => {
  it('un servicio sin descripción toma su nombre; uno con descripción, ambos', () => {
    const service = {
      id: '01999a00-0000-7000-8000-0000000c0601',
      code: 'SRV-0002',
      name: 'Soporte',
      description: null,
      unit: 'month' as const,
      base_price: '100.00',
      tax_key: 'IVA_EXENTO',
      tax_label: 'Sin IVA',
      is_active: true,
      version: 1,
    };
    expect(itemFromService(service)).toMatchObject({
      description: 'Soporte',
      taxKey: 'IVA_EXENTO',
    });
    expect(itemFromService({ ...service, description: 'Mensual' }).description).toBe(
      'Soporte: Mensual',
    );
  });

  it('cada ítem dice qué le falta con su número', () => {
    const values = {
      ...initialValues(null, new Date('2026-10-28T15:00:00Z')),
      paymentTerms: 'Contado',
      deliveryTerms: 'Un mes',
      items: [{ ...emptyItem(), description: 'x', quantity: '0', unitPrice: 'mil' }],
    };
    expect(problemsOf(values, '2026-10-28')).toMatchObject({
      'items.0.description': 'Escriba al menos tres letras.',
      'items.0.quantity': 'Escriba la cantidad, mayor que cero: 1.5',
      'items.0.unit_price': 'Escriba el valor en pesos, sin puntos de miles: 1500000.50',
    });
  });
});

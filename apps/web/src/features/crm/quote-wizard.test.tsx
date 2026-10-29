import { screen, within } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { Screen } from '../../test-support/core-fixtures';
import { OPPORTUNITY_ID } from '../../test-support/crm-fixtures';
import { json, noContent, renderWithApi, type SentRequest } from '../../test-support/fake-api';
import {
  OPTIONS,
  QUOTER,
  QUOTE_ID,
  SERVICE_ID,
  quoteDetail,
  serveQuotes,
} from '../../test-support/quote-fixtures';
import {
  draftBody,
  initialValues,
  liveTotals,
  needsApproval,
  problemsOf,
  stepProblems,
} from './quote-form-values';
import { EditQuote, NewQuote } from './quote-pages';

// Asistente de cotización (B23): pasos con su validación, ítems del portafolio o libres, totales
// en vivo con la misma función de la API, aviso de aprobación y guardado del borrador.

const push = vi.fn();

vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace: vi.fn(), push, back: vi.fn() }),
  usePathname: () => '/app/comercial/cotizaciones/nueva',
}));

beforeEach(() => {
  vi.stubGlobal('scrollTo', vi.fn());
});

afterEach(() => {
  vi.unstubAllGlobals();
  push.mockReset();
});

function posted(sent: readonly SentRequest[], path: string): SentRequest | undefined {
  return sent.find((request) => request.method !== 'GET' && request.path.endsWith(path));
}

async function next(): Promise<void> {
  await userEvent.click(screen.getByRole('button', { name: 'Siguiente' }));
}

describe('asistente: cotización nueva', () => {
  it('recorre los tres pasos con sus validaciones y guarda el borrador', async () => {
    const sent = serveQuotes(QUOTER, { 'POST /v1/crm/quotes': () => json({ id: QUOTE_ID }, 201) });
    renderWithApi(
      <Screen>
        <NewQuote opportunityId={OPPORTUNITY_ID} />
      </Screen>,
    );
    expect(await screen.findByText('Comercializadora Andina S.A.S.')).toBeVisible();
    await next();
    await next();
    expect(screen.getByRole('alert')).toHaveTextContent('Agregue al menos un ítem.');
    await userEvent.selectOptions(screen.getByLabelText('Servicio del portafolio'), SERVICE_ID);
    await userEvent.click(screen.getByRole('button', { name: 'Agregar del portafolio' }));
    const discount = screen.getByLabelText('Descuento en %');
    await userEvent.clear(discount);
    await userEvent.type(discount, '15');
    expect(screen.getByText(/pasa el tope de 10 %/u)).toBeVisible();
    const totals = screen.getByLabelText('Totales de la cotización');
    expect(within(totals).getByText(/85\.977,5/u)).toBeVisible();
    await next();
    await userEvent.click(screen.getByRole('button', { name: 'Guardar borrador' }));
    expect(screen.getByText('Escriba la forma de pago.')).toBeVisible();
    await userEvent.type(screen.getByLabelText('Forma de pago'), 'Contado');
    await userEvent.type(screen.getByLabelText('Plazo de entrega'), 'Un mes');
    await userEvent.click(screen.getByRole('button', { name: 'Guardar borrador' }));
    await vi.waitFor(() => {
      expect(push).toHaveBeenCalledWith(`/app/comercial/cotizaciones/${QUOTE_ID}`);
    });
    expect(posted(sent, '/v1/crm/quotes')?.body).toMatchObject({
      opportunity_id: OPPORTUNITY_ID,
      items: [
        { service_id: SERVICE_ID, quantity: '1', unit_price: '85000.00', discount_percent: '15' },
      ],
      conditions: { payment_terms: 'Contado', delivery_terms: 'Un mes', warranty: null },
    });
  });
});

describe('asistente: editar el borrador', () => {
  it('trae los valores guardados y guarda con la versión que se vio', async () => {
    const sent = serveQuotes(QUOTER, { [`PUT /v1/crm/quotes/${QUOTE_ID}`]: () => noContent() });
    renderWithApi(
      <Screen>
        <EditQuote id={QUOTE_ID} />
      </Screen>,
    );
    expect(await screen.findByLabelText(/Válida hasta/u)).toHaveValue('2026-11-30');
    await next();
    expect(screen.getByLabelText('Cantidad')).toHaveValue('10');
    await userEvent.click(screen.getByRole('button', { name: 'Quitar el ítem 1' }));
    await userEvent.click(screen.getByRole('button', { name: 'Agregar ítem libre' }));
    await userEvent.type(screen.getByLabelText('Descripción'), 'Soporte mensual');
    await userEvent.type(screen.getByLabelText('Valor unitario en pesos'), '2500000');
    await next();
    await userEvent.click(screen.getByRole('button', { name: 'Guardar borrador' }));
    await vi.waitFor(() => {
      expect(posted(sent, `/v1/crm/quotes/${QUOTE_ID}`)?.headers['If-Match']).toBe('"4"');
    });
  });

  it('una cotización que ya no es borrador no se edita', async () => {
    serveQuotes(QUOTER, {
      [`GET /v1/crm/quotes/${QUOTE_ID}`]: () => json(quoteDetail({ status: 'sent' })),
    });
    renderWithApi(
      <Screen>
        <EditQuote id={QUOTE_ID} />
      </Screen>,
    );
    expect(await screen.findByText(/ya no es un borrador/u)).toBeVisible();
  });
});

/** Un ítem con decimales y coma: lo que escribe una persona en el asistente. */
const values = {
  ...initialValues(null, new Date('2026-10-28T15:00:00Z')),
  paymentTerms: 'Contado',
  deliveryTerms: 'Un mes',
  items: [
    {
      key: 'a',
      serviceId: null,
      description: 'Desarrollo',
      unit: 'hour',
      quantity: '1,5',
      unitPrice: '120000.50',
      discountPercent: '7.5',
      taxKey: 'IVA_GENERAL',
    },
  ],
};
describe('valores del asistente', () => {
  it('propone 30 días de vigencia y acepta la coma decimal', () => {
    expect(values.validUntil).toBe('2026-11-27');
    expect(draftBody(values).items[0]).toMatchObject({ quantity: '1.5', unit_price: '120000.50' });
  });

  it('calcula los totales como la API y avisa si un descuento pasa el tope', () => {
    expect(liveTotals(values, OPTIONS)).toMatchObject({
      total: '198135.82',
      tax_total: '31635.13',
    });
    expect(needsApproval(values, '10')).toBe(false);
    expect(needsApproval(values, '5')).toBe(true);
    const missing = { ...values, items: [{ ...values.items[0], unitPrice: '' }] };
    expect(liveTotals(missing as typeof values, OPTIONS)).toBeNull();
  });
});

describe('valores del asistente: problemas', () => {
  it('separa los problemas por paso y pide una vigencia de hoy en adelante', () => {
    const empty = { ...values, items: [], paymentTerms: '', validUntil: '2026-10-01' };
    const problems = problemsOf(empty, '2026-10-28');
    expect(stepProblems(problems, 1)).toEqual({
      valid_until: 'La vigencia debe terminar hoy o más adelante.',
    });
    expect(stepProblems(problems, 2)).toEqual({ items: 'Agregue al menos un ítem.' });
    expect(stepProblems(problems, 3)).toEqual({ payment_terms: 'Escriba la forma de pago.' });
  });
});

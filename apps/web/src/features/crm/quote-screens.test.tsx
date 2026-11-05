import { screen, within } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { Screen } from '../../test-support/core-fixtures';
import { OPPORTUNITY_ID } from '../../test-support/crm-fixtures';
import { json, noContent, renderWithApi, type SentRequest } from '../../test-support/fake-api';
import {
  DIRECTION,
  DIRECTOR,
  OLD_QUOTE_ID,
  QUOTER,
  QUOTE_ID,
  QUOTE_READER,
  quoteDetail,
  serveQuotes,
} from '../../test-support/quote-fixtures';
import { OpportunityDetailPanel } from './opportunity-detail';
import { QuoteDetailPanel } from './quote-detail';
import { QuoteList } from './quote-list';

// Pantallas de cotizaciones (B23): la lista, la ficha con sus acciones según el estado y el
// permiso, y la sección de la oportunidad.

const push = vi.fn();

vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace: vi.fn(), push, back: vi.fn() }),
  usePathname: () => '/app/comercial/cotizaciones',
}));

beforeEach(() => {
  vi.stubGlobal('scrollTo', vi.fn());
});

afterEach(() => {
  vi.unstubAllGlobals();
  push.mockReset();
});

function renderQuote(): void {
  renderWithApi(
    <Screen>
      <QuoteDetailPanel id={QUOTE_ID} />
    </Screen>,
  );
}

function sentTo(sent: readonly SentRequest[], suffix: string): SentRequest | undefined {
  return sent.find((request) => request.method === 'POST' && request.path.endsWith(suffix));
}

function detailRoute(overrides: object) {
  return { [`GET /v1/crm/quotes/${QUOTE_ID}`]: () => json(quoteDetail(overrides)) };
}

describe('lista de cotizaciones', () => {
  it('muestra la última versión de cada una y filtra por estado', async () => {
    const sent = serveQuotes(QUOTER);
    renderWithApi(
      <Screen>
        <QuoteList />
      </Screen>,
    );
    expect(await screen.findByRole('link', { name: 'COT-2026-0001 · v2' })).toBeVisible();
    expect(screen.getByText('Comercializadora Andina S.A.S.')).toBeVisible();
    await userEvent.selectOptions(screen.getByLabelText('Estado'), 'sent');
    await userEvent.click(screen.getByRole('button', { name: 'Buscar' }));
    await vi.waitFor(() => {
      expect(sent.some((request) => request.search.includes('status=sent'))).toBe(true);
    });
  });

  it('sin cotizaciones explica dónde se crean', async () => {
    serveQuotes(QUOTER, { 'GET /v1/crm/quotes': () => json({ data: [], next_cursor: null }) });
    renderWithApi(
      <Screen>
        <QuoteList />
      </Screen>,
    );
    expect(await screen.findByText('Todavía no hay cotizaciones')).toBeVisible();
  });
});

describe('ficha: borrador', () => {
  it('se edita o se pide el envío con la versión que se vio', async () => {
    const sent = serveQuotes(QUOTER, {
      [`POST /v1/crm/quotes/${QUOTE_ID}/actions/submit`]: () => noContent(),
    });
    renderQuote();
    expect(await screen.findByRole('heading', { name: 'COT-2026-0001 · versión 2' })).toBeVisible();
    expect(await screen.findByRole('link', { name: 'Editar' })).toHaveAttribute(
      'href',
      `/app/comercial/cotizaciones/${QUOTE_ID}/editar`,
    );
    expect(screen.getByRole('cell', { name: /Desarrollo a la medida/u })).toBeVisible();
    await userEvent.click(screen.getByRole('button', { name: 'Pedir el envío' }));
    await vi.waitFor(() => {
      expect(sentTo(sent, '/actions/submit')?.headers['If-Match']).toBe('"4"');
    });
  });

  it('quien solo lee no tiene acciones', async () => {
    serveQuotes(QUOTE_READER);
    renderQuote();
    await screen.findByRole('heading', { name: 'COT-2026-0001 · versión 2' });
    expect(screen.queryByRole('button', { name: 'Pedir el envío' })).toBeNull();
    expect(screen.queryByRole('link', { name: 'Editar' })).toBeNull();
  });

  it('una devuelta muestra el comentario de la Dirección', async () => {
    serveQuotes(QUOTER, detailRoute({ approval: { ...APPROVAL, note: 'Baje el descuento.' } }));
    renderQuote();
    expect(
      await screen.findByText(/La Dirección la devolvió: «Baje el descuento.»/u),
    ).toBeVisible();
  });
});

const APPROVAL = {
  required: true,
  largest_discount: '15.00',
  discount_cap: '10.00',
  decided_by: null,
  decided_at: null,
  note: null,
};

describe('ficha: aprobación de la Dirección', () => {
  it('la Dirección aprueba con confirmación', async () => {
    const sent = serveQuotes(DIRECTION, {
      ...detailRoute({ status: 'in_approval', approval: APPROVAL }),
      [`POST /v1/crm/quotes/${QUOTE_ID}/actions/approve`]: () => noContent(),
    });
    renderQuote();
    expect(await screen.findByText(/pasa el tope de 10 %/u)).toBeVisible();
    await userEvent.click(await screen.findByRole('button', { name: 'Aprobar' }));
    await userEvent.click(await screen.findByRole('button', { name: 'Sí, aprobar' }));
    await vi.waitFor(() => {
      expect(sentTo(sent, '/actions/approve')?.body).toEqual({ comment: null });
    });
  });

  it('devolver exige el comentario', async () => {
    const sent = serveQuotes(DIRECTION, {
      ...detailRoute({ status: 'in_approval', approval: APPROVAL }),
      [`POST /v1/crm/quotes/${QUOTE_ID}/actions/return`]: () => noContent(),
    });
    renderQuote();
    await userEvent.click(await screen.findByRole('button', { name: 'Devolver para corregir' }));
    const dialog = await screen.findByRole('dialog');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Devolver' }));
    expect(within(dialog).getByText('Escriba qué debe corregirse.')).toBeVisible();
    await userEvent.type(
      within(dialog).getByLabelText('Qué debe corregirse'),
      'Baje el descuento.',
    );
    await userEvent.click(within(dialog).getByRole('button', { name: 'Devolver' }));
    await vi.waitFor(() => {
      expect(sentTo(sent, '/actions/return')?.body).toEqual({ comment: 'Baje el descuento.' });
    });
  });
});

describe('ficha: enviar', () => {
  it('con el PDF listo se envía al correo del cliente, que se puede cambiar', async () => {
    const sent = serveQuotes(QUOTER, {
      ...detailRoute({
        status: 'approved',
        pdf: { status: 'ready', file_name: 'COT-2026-0001-v2.pdf' },
      }),
      [`POST /v1/crm/quotes/${QUOTE_ID}/actions/send`]: () => noContent(),
    });
    renderQuote();
    await userEvent.click(await screen.findByRole('button', { name: 'Enviar al cliente' }));
    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByLabelText('Correo electrónico')).toHaveValue(
      'compras@andina.example',
    );
    await userEvent.click(within(dialog).getByRole('button', { name: 'Enviar' }));
    expect(within(dialog).getByText('Escriba el nombre de quien la recibe.')).toBeVisible();
    await userEvent.type(
      within(dialog).getByLabelText('Nombre de quien la recibe'),
      'Clara Cliente',
    );
    await userEvent.click(within(dialog).getByRole('button', { name: 'Enviar' }));
    await vi.waitFor(() => {
      expect(sentTo(sent, '/actions/send')?.body).toEqual({
        recipient_name: 'Clara Cliente',
        recipient_email: 'compras@andina.example',
      });
    });
  });

  it('mientras se prepara el PDF no se puede enviar', async () => {
    serveQuotes(
      QUOTER,
      detailRoute({ status: 'approved', pdf: { status: 'pending', file_name: null } }),
    );
    renderQuote();
    expect(await screen.findByText(/Preparando el PDF/u)).toBeVisible();
    expect(screen.queryByRole('button', { name: 'Enviar al cliente' })).toBeNull();
  });
});

describe('ficha: respuesta del cliente y versiones', () => {
  it('muestra la evidencia de la aceptación y abre la versión anterior', async () => {
    serveQuotes(
      QUOTER,
      detailRoute({
        status: 'accepted',
        pdf: { status: 'ready', file_name: 'COT-2026-0001-v2.pdf' },
        approval: { ...APPROVAL, decided_by: DIRECTOR, decided_at: '2026-10-28T16:00:00.000Z' },
        response: {
          decision: 'accepted',
          at: '2026-10-29T15:00:00.000Z',
          by_name: 'Clara Cliente',
          reason: null,
          ip: '203.0.113.7',
          user_agent: 'Navegador de prueba',
          pdf_sha256: 'a'.repeat(64),
        },
      }),
    );
    renderQuote();
    expect(await screen.findByText('Evidencia de la respuesta del cliente')).toBeVisible();
    expect(screen.getByText('Clara Cliente')).toBeVisible();
    expect(screen.getByText('203.0.113.7')).toBeVisible();
    expect(screen.getByRole('link', { name: 'Versión 1' })).toHaveAttribute(
      'href',
      `/app/comercial/cotizaciones/${OLD_QUOTE_ID}`,
    );
    expect(screen.queryByRole('button', { name: 'Crear versión nueva' })).toBeNull();
  });
});

describe('ficha: versiones', () => {
  it('una rechazada da la versión nueva y lleva a ella', async () => {
    const newId = '01999a00-0000-7000-8000-0000000c0502';
    serveQuotes(QUOTER, {
      ...detailRoute({
        status: 'rejected',
        versions: [
          {
            id: QUOTE_ID,
            version_number: 2,
            status: 'rejected',
            total: '1.00',
            created_at: '2026-10-28T15:00:00.000Z',
          },
        ],
      }),
      [`POST /v1/crm/quotes/${QUOTE_ID}/actions/new-version`]: () => json({ id: newId }, 201),
    });
    renderQuote();
    await userEvent.click(await screen.findByRole('button', { name: 'Crear versión nueva' }));
    await userEvent.click(await screen.findByRole('button', { name: 'Sí, crear' }));
    await vi.waitFor(() => {
      expect(push).toHaveBeenCalledWith(`/app/comercial/cotizaciones/${newId}`);
    });
  });
});

describe('cotizaciones de la oportunidad', () => {
  it('las muestra en su ficha con el botón para crear otra', async () => {
    serveQuotes(QUOTER);
    renderWithApi(
      <Screen>
        <OpportunityDetailPanel id={OPPORTUNITY_ID} />
      </Screen>,
    );
    expect(await screen.findByRole('link', { name: 'Nueva cotización' })).toHaveAttribute(
      'href',
      `/app/comercial/cotizaciones/nueva?oportunidad=${OPPORTUNITY_ID}`,
    );
    expect(await screen.findByRole('link', { name: 'COT-2026-0001 · v2' })).toBeVisible();
  });
});

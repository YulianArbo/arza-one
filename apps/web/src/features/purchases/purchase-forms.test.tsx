import type { PermissionCode } from '@arza/contracts';
import { screen, within } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import type { JSX } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { Screen } from '../../test-support/core-fixtures';
import {
  SESSION,
  apiError,
  json,
  mockApi,
  noContent,
  renderWithApi,
  type SentRequest,
} from '../../test-support/fake-api';
import { permissionsOf } from '../../test-support/party-fixtures';
import { ComparisonPanel } from './comparison-panel';
import {
  OPTIONS,
  ORDER,
  QUOTE,
  QUOTE_ID,
  REQUEST,
  REQUEST_ID,
  TRAVEL,
  TRAVEL_ID,
} from './purchase-fixtures';
import { ReceiptsPanel } from './receipts-panel';
import { RequestsPanel } from './requests-panel';
import { TravelPanel } from './travel-panel';

// Formularios y estados de las pantallas de Compras (B33): rechazo con motivo, envío a aprobación,
// cotización, viaje nuevo, quitar registros y estados vacíos.

vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace: vi.fn(), push: vi.fn() }),
  usePathname: () => '/app/compras',
}));

const REQUESTS = '/v1/purchase-requests';
const TRAVELS = '/v1/travel-requests';

function serve(permissions: readonly PermissionCode[], extra: object = {}): SentRequest[] {
  return mockApi({
    'GET /v1/auth/session': () => json(SESSION),
    'GET /v1/me/permissions': () => json(permissionsOf(permissions)),
    [`GET ${REQUESTS}/options`]: () => json(OPTIONS),
    ...extra,
  });
}

function show(panel: JSX.Element): void {
  renderWithApi(<Screen>{panel}</Screen>);
}

function sentTo(sent: readonly SentRequest[], ending: string): SentRequest | undefined {
  return sent.find((request) => request.path.endsWith(ending));
}

beforeEach(() => {
  vi.stubGlobal('scrollTo', vi.fn());
});

afterEach(() => {
  vi.unstubAllGlobals();
});

async function rejectsRequest(): Promise<void> {
  const sent = serve(['purchase.read', 'purchase.request.approve'], {
    [`GET ${REQUESTS}`]: () => json({ data: [REQUEST] }),
    [`POST ${REQUESTS}/${REQUEST_ID}/rejection`]: () => noContent(),
  });
  show(<RequestsPanel />);
  await userEvent.click(
    await screen.findByRole('button', { name: 'Rechazar la solicitud SC-2026-0001' }),
  );
  const dialog = await screen.findByRole('dialog');
  await userEvent.click(within(dialog).getByRole('button', { name: 'Rechazar solicitud' }));
  expect(await within(dialog).findAllByText(/Escriba el motivo/u)).not.toHaveLength(0);
  await userEvent.type(within(dialog).getByLabelText('Motivo'), 'No está presupuestada');
  await userEvent.click(within(dialog).getByRole('button', { name: 'Rechazar solicitud' }));
  await vi.waitFor(() => {
    const rejection = sentTo(sent, '/rejection');
    expect(rejection?.body).toEqual({ reason: 'No está presupuestada' });
    expect(rejection?.headers['If-Match']).toBe('"2"');
  });
}

async function submitsOwnDraft(): Promise<void> {
  const draft = { ...REQUEST, status: 'draft', mine: true, tier: null, min_quotes: null };
  const rejected = { ...REQUEST, id: QUOTE_ID, status: 'rejected', decision_note: 'Sin cupo' };
  const sent = serve(['purchase.request.create'], {
    [`GET ${REQUESTS}/mine`]: () => json({ data: [draft, rejected] }),
    [`POST ${REQUESTS}/${REQUEST_ID}/submission`]: () =>
      apiError(409, 'PUR_TIERS_MISSING', 'La empresa no tiene topes vigentes.'),
  });
  show(<RequestsPanel />);
  expect(await screen.findByText('Sin topes vigentes')).toBeVisible();
  expect(screen.getByText('Sin cupo')).toBeVisible();
  const submit = 'Enviar a aprobación la solicitud SC-2026-0001';
  await userEvent.click(screen.getByRole('button', { name: submit }));
  expect(await screen.findByText('La empresa no tiene topes vigentes.')).toBeVisible();
  expect(sentTo(sent, '/submission')?.headers['If-Match']).toBe('"2"');
}

describe('acciones sobre una solicitud de compra (B33)', () => {
  it('rechaza con motivo y con la versión de la solicitud', async () => {
    await rejectsRequest();
  });

  it('el autor envía su borrador y ve el mensaje si la API lo rechaza', async () => {
    await submitsOwnDraft();
  });

  it('quien cotiza encuentra el camino al cuadro comparativo', async () => {
    const approved = { ...REQUEST, status: 'approved' };
    serve(['purchase.read', 'purchase.order.issue'], {
      [`GET ${REQUESTS}`]: () => json({ data: [approved] }),
    });
    show(<RequestsPanel />);
    const link = await screen.findByRole('link', { name: 'Ir al cuadro comparativo' });
    expect(link).toHaveAttribute('href', '/app/compras/cuadro-comparativo');
  });
});

async function quoteFormAsksForData(): Promise<void> {
  const approved = { ...REQUEST, status: 'approved', quotes: [], min_quotes: null };
  const sent = serve(['purchase.read', 'purchase.order.issue'], {
    [`GET ${REQUESTS}`]: () => json({ data: [approved] }),
  });
  show(<ComparisonPanel />);
  expect(await screen.findByText('Aún no tiene cotizaciones.')).toBeVisible();
  expect(screen.getByText('Tiene 0 cotizaciones.')).toBeVisible();
  await userEvent.click(await screen.findByRole('button', { name: 'Agregar cotización' }));
  const dialog = await screen.findByRole('dialog');
  const suppliers = within(dialog).getByLabelText('Proveedor');
  expect(within(suppliers).getByText(/sin conocimiento del tercero vigente/u)).toBeVisible();
  await userEvent.type(within(dialog).getByLabelText('Días de entrega'), '500');
  await userEvent.click(within(dialog).getByRole('button', { name: 'Agregar cotización' }));
  expect(await within(dialog).findByText('Adjunte la cotización.')).toBeVisible();
  expect(within(dialog).getAllByText('Elija un proveedor.')).not.toHaveLength(0);
  expect(within(dialog).getAllByText('Escriba los días de entrega, de 0 a 365.')).not.toHaveLength(
    0,
  );
  expect(sent.some((request) => request.method === 'POST')).toBe(false);
}

describe('cotizaciones del cuadro comparativo (B33)', () => {
  it('el formulario exige proveedor, plazo válido y archivo', async () => {
    await quoteFormAsksForData();
  });

  it('quita una cotización que no es la elegida', async () => {
    const approved = { ...REQUEST, status: 'approved', quotes: [QUOTE] };
    const sent = serve(['purchase.read', 'purchase.order.issue'], {
      [`GET ${REQUESTS}`]: () => json({ data: [approved] }),
      [`DELETE /v1/purchase-quotes/${QUOTE_ID}`]: () => noContent(),
    });
    show(<ComparisonPanel />);
    const remove = 'Quitar la cotización de Papelería El Cóndor Ltda. en SC-2026-0001';
    await userEvent.click(await screen.findByRole('button', { name: remove }));
    await vi.waitFor(() => {
      expect(sent.some((request) => request.method === 'DELETE')).toBe(true);
    });
  });

  it('sin solicitudes aprobadas lo dice; devuelta a aprobación, no deja gestionar', async () => {
    const back = { ...REQUEST, quotes: [{ ...QUOTE, selected: true }] };
    serve(['purchase.read', 'purchase.order.issue'], {
      [`GET ${REQUESTS}`]: () => json({ data: [back] }),
      'GET /v1/purchase-orders': () => json({ data: [ORDER] }),
    });
    show(<ComparisonPanel />);
    expect(await screen.findAllByText('Elegida')).toHaveLength(2);
    expect(screen.queryByRole('button', { name: 'Agregar cotización' })).toBeNull();
    show(<ReceiptsPanel />);
    expect(await screen.findByText('Aún no hay recepciones')).toBeVisible();
  });
});

async function createsTravel(): Promise<void> {
  const sent = serve(['purchase.travel.request'], {
    [`GET ${TRAVELS}/mine`]: () => json({ data: [] }),
    [`POST ${TRAVELS}`]: () => json({ id: TRAVEL_ID }, 201),
  });
  show(<TravelPanel />);
  expect(await screen.findByText('Aún no hay viajes')).toBeVisible();
  await userEvent.click(screen.getByRole('button', { name: 'Nueva solicitud de viaje' }));
  const dialog = await screen.findByRole('dialog');
  await userEvent.click(within(dialog).getByRole('button', { name: 'Crear solicitud' }));
  expect(await within(dialog).findAllByText('Escriba la fecha.')).toHaveLength(2);
  await userEvent.type(within(dialog).getByLabelText('Destino'), 'Medellín');
  await userEvent.type(within(dialog).getByLabelText('Motivo'), 'Visita de prueba');
  await userEvent.type(within(dialog).getByLabelText('Salida'), '2026-11-20');
  await userEvent.type(within(dialog).getByLabelText('Regreso'), '2026-11-19');
  await userEvent.click(within(dialog).getByRole('button', { name: 'Crear solicitud' }));
  expect(
    await within(dialog).findAllByText(/El regreso no puede ser anterior a la salida/u),
  ).not.toHaveLength(0);
  await userEvent.clear(within(dialog).getByLabelText('Regreso'));
  await userEvent.type(within(dialog).getByLabelText('Regreso'), '2026-11-22');
  await userEvent.click(within(dialog).getByRole('button', { name: 'Crear solicitud' }));
  await vi.waitFor(() => {
    expect(sent.find((request) => request.method === 'POST')?.body).toEqual({
      destination: 'Medellín',
      purpose: 'Visita de prueba',
      starts_on: '2026-11-20',
      ends_on: '2026-11-22',
      advance_amount: '0',
    });
  });
}

async function travelLifecycle(): Promise<void> {
  const draft = { ...TRAVEL, status: 'draft', expenses: [], version: 1 };
  const legalized = { ...TRAVEL, id: REQUEST_ID, code: 'SV-2026-0002', status: 'legalized' };
  const sent = serve(['purchase.travel.request'], {
    [`GET ${TRAVELS}/mine`]: () => json({ data: [draft, legalized, TRAVEL] }),
    [`POST ${TRAVELS}/${TRAVEL_ID}/submission`]: () => noContent(),
    [`DELETE /v1/travel-expenses/${TRAVEL.expenses[0].id}`]: () => noContent(),
  });
  show(<TravelPanel />);
  const submit = 'Enviar a aprobación el viaje SV-2026-0001';
  await userEvent.click(await screen.findByRole('button', { name: submit }));
  await vi.waitFor(() => {
    expect(sentTo(sent, '/submission')?.headers['If-Match']).toBe('"1"');
  });
  await userEvent.click(
    screen.getByRole('button', { name: 'Ver los gastos del viaje SV-2026-0002' }),
  );
  const view = await screen.findByRole('dialog');
  expect(within(view).getByText('Hotel de prueba')).toBeVisible();
  expect(within(view).queryByRole('button', { name: /Quitar/u })).toBeNull();
  await userEvent.keyboard('{Escape}');
  await userEvent.click(screen.getByRole('button', { name: 'Legalizar el viaje SV-2026-0001' }));
  const dialog = await screen.findByRole('dialog');
  const remove = 'Quitar el gasto Hotel de prueba';
  await userEvent.click(within(dialog).getByRole('button', { name: remove }));
  await vi.waitFor(() => {
    expect(sent.some((request) => request.method === 'DELETE')).toBe(true);
  });
}

describe('viajes: solicitud, envío y gastos (B33)', () => {
  it('el formulario valida fechas y crea el viaje', async () => {
    await createsTravel();
  });

  it('el viajero envía su borrador, ve los gastos legalizados y quita un gasto', async () => {
    await travelLifecycle();
  });

  it('quien aprueba rechaza el viaje con motivo', async () => {
    const pending = { ...TRAVEL, status: 'in_approval', mine: false, expenses: [], version: 2 };
    const sent = serve(['purchase.read', 'purchase.travel.approve'], {
      [`GET ${TRAVELS}`]: () => json({ data: [pending] }),
      [`POST ${TRAVELS}/${TRAVEL_ID}/rejection`]: () => noContent(),
      [`POST ${TRAVELS}/${TRAVEL_ID}/approval`]: () => noContent(),
    });
    show(<TravelPanel />);
    await userEvent.click(
      await screen.findByRole('button', { name: 'Rechazar el viaje SV-2026-0001' }),
    );
    const dialog = await screen.findByRole('dialog');
    await userEvent.type(within(dialog).getByLabelText('Motivo'), 'Se hará por videollamada');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Rechazar viaje' }));
    await vi.waitFor(() => {
      expect(sentTo(sent, '/rejection')?.body).toEqual({ reason: 'Se hará por videollamada' });
    });
  });
});

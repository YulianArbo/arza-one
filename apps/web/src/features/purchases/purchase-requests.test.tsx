import type { PermissionCode } from '@arza/contracts';
import { screen, within } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { Screen } from '../../test-support/core-fixtures';
import {
  SESSION,
  json,
  mockApi,
  noContent,
  renderWithApi,
  type SentRequest,
} from '../../test-support/fake-api';
import { permissionsOf } from '../../test-support/party-fixtures';
import { ComparisonPanel } from './comparison-panel';
import { CENTER_ID, OPTIONS, QUOTE, QUOTE_ID, REQUEST, REQUEST_ID } from './purchase-fixtures';
import { tierHint } from './request-form';
import { RequestsPanel } from './requests-panel';

// Pantallas de solicitudes de compra y cuadro comparativo (B33).

vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace: vi.fn(), push: vi.fn() }),
  usePathname: () => '/app/compras',
}));

const REQUESTS = '/v1/purchase-requests';

function serve(permissions: readonly PermissionCode[], extra: object = {}): SentRequest[] {
  return mockApi({
    'GET /v1/auth/session': () => json(SESSION),
    'GET /v1/me/permissions': () => json(permissionsOf(permissions)),
    [`GET ${REQUESTS}/options`]: () => json(OPTIONS),
    ...extra,
  });
}

function show(panel: 'requests' | 'comparison'): void {
  renderWithApi(<Screen>{panel === 'requests' ? <RequestsPanel /> : <ComparisonPanel />}</Screen>);
}

beforeEach(() => {
  vi.stubGlobal('scrollTo', vi.fn());
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('lo que exige el valor de una compra', () => {
  it('dice el tramo y las cotizaciones según los topes vigentes', () => {
    expect(tierHint('800000', OPTIONS.data)).toBe('Tramo bajo: exige 1 cotización.');
    expect(tierHint('5000000,50', OPTIONS.data)).toBe('Tramo medio: exige 2 cotizaciones.');
    expect(tierHint('12000000', OPTIONS.data)).toBe(
      'Tramo alto (Dirección): exige 3 cotizaciones.',
    );
    expect(tierHint('abc', OPTIONS.data)).toBeNull();
    expect(tierHint('800000', undefined)).toBeNull();
  });
});

async function collaboratorCreates(): Promise<void> {
  const sent = serve(['purchase.request.create'], {
    [`GET ${REQUESTS}/mine`]: () => json({ data: [] }),
    [`POST ${REQUESTS}`]: () => json({ id: REQUEST_ID }, 201),
  });
  show('requests');
  expect(await screen.findByText('Aún no hay solicitudes de compra')).toBeVisible();
  expect(sent.some((request) => request.path === REQUESTS)).toBe(false);
  await userEvent.click(screen.getByRole('button', { name: 'Nueva solicitud' }));
  const dialog = await screen.findByRole('dialog');
  await userEvent.click(within(dialog).getByRole('button', { name: 'Crear solicitud' }));
  expect(await within(dialog).findByText('Elija un centro de costo.')).toBeVisible();
  await userEvent.selectOptions(within(dialog).getByLabelText('Centro de costo'), CENTER_ID);
  await userEvent.type(within(dialog).getByLabelText('Descripción'), 'Sillas de prueba');
  await userEvent.type(within(dialog).getByLabelText('Valor estimado'), '5000000');
  expect(within(dialog).getByText('Tramo medio: exige 2 cotizaciones.')).toBeVisible();
  await userEvent.click(within(dialog).getByRole('button', { name: 'Crear solicitud' }));
  await vi.waitFor(() => {
    expect(sent.find((request) => request.method === 'POST')?.body).toEqual({
      cost_center_id: CENTER_ID,
      description: 'Sillas de prueba',
      estimated_amount: '5000000',
    });
  });
}

describe('pantalla de solicitudes de compra (B33)', () => {
  it('el colaborador ve solo las suyas y el formulario exige los datos', async () => {
    await collaboratorCreates();
  });

  it('quien aprueba decide la solicitud de otra persona', async () => {
    const sent = serve(['purchase.read', 'purchase.request.approve'], {
      [`GET ${REQUESTS}`]: () => json({ data: [REQUEST] }),
      [`POST ${REQUESTS}/${REQUEST_ID}/approval`]: () => noContent(),
    });
    show('requests');
    await userEvent.click(
      await screen.findByRole('button', { name: 'Aprobar la solicitud SC-2026-0001' }),
    );
    await vi.waitFor(() => {
      const approval = sent.find((request) => request.path.endsWith('/approval'));
      expect(approval?.headers['If-Match']).toBe('"2"');
    });
    expect(
      screen.getByRole('button', { name: 'Rechazar la solicitud SC-2026-0001' }),
    ).toBeVisible();
  });

  it('no ofrece aprobar lo propio ni el tramo alto sin ser la Dirección', async () => {
    const high = { ...REQUEST, id: QUOTE_ID, code: 'SC-2026-0002', tier: 'high', min_quotes: 3 };
    serve(['purchase.read', 'purchase.request.approve'], {
      [`GET ${REQUESTS}`]: () => json({ data: [{ ...REQUEST, mine: true }, high] }),
    });
    show('requests');
    expect(await screen.findByText('La aprueba otra persona')).toBeVisible();
    expect(screen.getByText('La aprueba la Dirección')).toBeVisible();
    expect(screen.queryByRole('button', { name: /Aprobar la solicitud/u })).toBeNull();
  });
});

const approved = { ...REQUEST, status: 'approved', version: 3, quotes: [QUOTE] };

async function choosesQuote(): Promise<void> {
  const sent = serve(['purchase.read', 'purchase.order.issue'], {
    [`GET ${REQUESTS}`]: () => json({ data: [approved, { ...REQUEST, status: 'draft' }] }),
    [`POST /v1/purchase-quotes/${QUOTE_ID}/selection`]: () => noContent(),
  });
  show('comparison');
  expect(await screen.findByText('Exige 2 cotizaciones; tiene 1 cotización.')).toBeVisible();
  expect(screen.getAllByText(/SC-2026-0001 ·/u)).toHaveLength(1);
  const choose = 'Elegir la cotización de Papelería El Cóndor Ltda. en SC-2026-0001';
  await userEvent.click(await screen.findByRole('button', { name: choose }));
  await vi.waitFor(() => {
    const selection = sent.find((request) => request.path.endsWith('/selection'));
    expect(selection?.headers['If-Match']).toBe('"3"');
  });
  expect(screen.queryByRole('button', { name: /Emitir la orden/u })).toBeNull();
}

describe('cuadro comparativo (B33)', () => {
  it('muestra cuántas cotizaciones exige y elige con la versión de la solicitud', async () => {
    await choosesQuote();
  });

  it('con la cotización elegida emite la orden', async () => {
    const quoted = { ...approved, status: 'quoted', quotes: [{ ...QUOTE, selected: true }] };
    const sent = serve(['purchase.read', 'purchase.order.issue'], {
      [`GET ${REQUESTS}`]: () => json({ data: [quoted] }),
      [`POST ${REQUESTS}/${REQUEST_ID}/order`]: () => json({ id: QUOTE_ID }, 201),
    });
    show('comparison');
    await userEvent.click(
      await screen.findByRole('button', { name: 'Emitir la orden de compra de SC-2026-0001' }),
    );
    await vi.waitFor(() => {
      expect(sent.some((request) => request.path.endsWith('/order'))).toBe(true);
    });
    expect(screen.queryByRole('button', { name: /Elegir la cotización/u })).toBeNull();
  });

  it('quien solo lee no ve acciones', async () => {
    serve(['purchase.read'], { [`GET ${REQUESTS}`]: () => json({ data: [approved] }) });
    show('comparison');
    expect(await screen.findByText('Papelería El Cóndor Ltda.')).toBeVisible();
    expect(screen.queryByRole('button', { name: 'Agregar cotización' })).toBeNull();
    expect(screen.queryByRole('button', { name: /Elegir|Quitar|Emitir/u })).toBeNull();
  });
});

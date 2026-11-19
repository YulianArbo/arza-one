import type { PermissionCode } from '@arza/contracts';
import { screen, within } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import type { JSX } from 'react';
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
import { EvaluationsPanel } from './evaluations-panel';
import { OrdersPanel } from './orders-panel';
import {
  EVALUATION,
  OPTIONS,
  ORDER,
  ORDER_ID,
  RECEIPT,
  SUPPLIER_ID,
  TRAVEL,
  TRAVEL_ID,
} from './purchase-fixtures';
import { PurchasesHome } from './purchases-home';
import { ReceiptsPanel } from './receipts-panel';
import { balanceText } from './travel-legalization';
import { TravelPanel } from './travel-panel';

// Pantallas de órdenes, recepciones, evaluación de proveedores, viajes y portada de Compras (B33).

vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace: vi.fn(), push: vi.fn() }),
  usePathname: () => '/app/compras',
}));

function serve(permissions: readonly PermissionCode[], extra: object = {}): SentRequest[] {
  return mockApi({
    'GET /v1/auth/session': () => json(SESSION),
    'GET /v1/me/permissions': () => json(permissionsOf(permissions)),
    'GET /v1/purchase-requests/options': () => json(OPTIONS),
    ...extra,
  });
}

function show(panel: JSX.Element): void {
  renderWithApi(<Screen>{panel}</Screen>);
}

beforeEach(() => {
  vi.stubGlobal('scrollTo', vi.fn());
});

afterEach(() => {
  vi.unstubAllGlobals();
});

async function nonConformingReceipt(): Promise<void> {
  const sent = serve(['purchase.read', 'purchase.order.receive'], {
    'GET /v1/purchase-orders': () => json({ data: [ORDER] }),
    [`POST /v1/purchase-orders/${ORDER_ID}/receipts`]: () => json({ id: ORDER_ID }, 201),
  });
  show(<OrdersPanel />);
  const open = 'Registrar recepción de la orden OC-2026-0001';
  await userEvent.click(await screen.findByRole('button', { name: open }));
  const dialog = await screen.findByRole('dialog');
  await userEvent.type(within(dialog).getByLabelText('Fecha de recepción'), '2026-11-11');
  await userEvent.click(within(dialog).getByLabelText('Llegó conforme'));
  await userEvent.click(within(dialog).getByRole('button', { name: 'Registrar recepción' }));
  expect(await within(dialog).findByText('Explique qué no llegó conforme.')).toBeVisible();
  await userEvent.type(within(dialog).getByLabelText('Novedad'), 'Llegaron dos sillas menos');
  await userEvent.click(within(dialog).getByRole('button', { name: 'Registrar recepción' }));
  await vi.waitFor(() => {
    expect(sent.find((request) => request.method === 'POST')?.body).toEqual({
      received_on: '2026-11-11',
      conforming: false,
      note: 'Llegaron dos sillas menos',
    });
  });
}

describe('órdenes de compra y recepciones (B33)', () => {
  it('una recepción no conforme exige la novedad y se envía con su fecha', async () => {
    await nonConformingReceipt();
  });

  it('quien pidió la compra no la recibe; recibida, se puede cerrar', async () => {
    const received = { ...ORDER, id: SUPPLIER_ID, code: 'OC-2026-0002', status: 'received' };
    const sent = serve(['purchase.read', 'purchase.order.receive', 'purchase.order.issue'], {
      'GET /v1/purchase-orders': () =>
        json({ data: [{ ...ORDER, requested_by_me: true }, received] }),
      [`POST /v1/purchase-orders/${SUPPLIER_ID}/closure`]: () => noContent(),
    });
    show(<OrdersPanel />);
    expect(await screen.findByText('La recibe otra persona')).toBeVisible();
    await userEvent.click(screen.getByRole('button', { name: 'Cerrar la orden OC-2026-0002' }));
    await vi.waitFor(() => {
      const closure = sent.find((request) => request.path.endsWith('/closure'));
      expect(closure?.headers['If-Match']).toBe('"1"');
    });
  });

  it('la pantalla de recepciones lista las novedades', async () => {
    serve(['purchase.read'], {
      'GET /v1/purchase-orders': () => json({ data: [{ ...ORDER, receipts: [RECEIPT] }] }),
    });
    show(<ReceiptsPanel />);
    expect(await screen.findByText('No conforme')).toBeVisible();
    expect(screen.getByText('Llegaron dos sillas menos')).toBeVisible();
    expect(screen.getByText('Laura Compras')).toBeVisible();
  });
});

async function evaluatesSupplier(): Promise<void> {
  const sent = serve(['purchase.read', 'purchase.supplier.evaluate'], {
    'GET /v1/supplier-evaluations': () => json({ data: [EVALUATION] }),
    'POST /v1/supplier-evaluations': () => json({ id: SUPPLIER_ID }, 201),
  });
  show(<EvaluationsPanel />);
  expect(await screen.findByText('4,25')).toBeVisible();
  await userEvent.click(screen.getByRole('button', { name: 'Evaluar proveedor' }));
  const dialog = await screen.findByRole('dialog');
  await userEvent.click(within(dialog).getByRole('button', { name: 'Guardar evaluación' }));
  expect(await within(dialog).findByText('Elija un proveedor.')).toBeVisible();
  await userEvent.selectOptions(within(dialog).getByLabelText('Proveedor'), SUPPLIER_ID);
  await userEvent.type(within(dialog).getByLabelText('Periodo'), '2027');
  for (const label of ['Calidad', 'Cumplimiento', 'Precio']) {
    await userEvent.selectOptions(within(dialog).getByLabelText(label), '3');
  }
  await userEvent.selectOptions(within(dialog).getByLabelText('Servicio'), '2');
  expect(within(dialog).getByText('Puntaje 2,75: No aprobado.')).toBeVisible();
  await userEvent.click(within(dialog).getByRole('button', { name: 'Guardar evaluación' }));
  await vi.waitFor(() => {
    expect(sent.find((request) => request.method === 'POST')?.body).toEqual({
      supplier_id: SUPPLIER_ID,
      kind: 'reevaluation',
      period: '2027',
      criteria: { quality: 3, compliance: 3, price: 3, service: 2 },
      note: null,
    });
  });
}

describe('evaluación de proveedores (B33)', () => {
  it('muestra el resultado al calificar y guarda la evaluación', async () => {
    await evaluatesSupplier();
  });

  it('quien solo lee no ve el formulario', async () => {
    serve(['purchase.read'], { 'GET /v1/supplier-evaluations': () => json({ data: [] }) });
    show(<EvaluationsPanel />);
    expect(await screen.findByText('Aún no hay evaluaciones')).toBeVisible();
    expect(screen.queryByRole('button', { name: 'Evaluar proveedor' })).toBeNull();
  });
});

async function legalizesTravel(): Promise<void> {
  const sent = serve(['purchase.travel.request'], {
    'GET /v1/travel-requests/mine': () => json({ data: [TRAVEL] }),
    [`POST /v1/travel-requests/${TRAVEL_ID}/legalization`]: () => noContent(),
  });
  show(<TravelPanel />);
  await userEvent.click(
    await screen.findByRole('button', { name: 'Legalizar viaje SV-2026-0001' }),
  );
  const dialog = await screen.findByRole('dialog');
  expect(within(dialog).getByText('Hotel de prueba')).toBeVisible();
  expect(within(dialog).getByText(/Al viajero se le deben/u)).toBeVisible();
  await userEvent.click(within(dialog).getByRole('button', { name: 'Agregar gasto' }));
  expect(await within(dialog).findByText('Adjunte el soporte.')).toBeVisible();
  await userEvent.click(
    within(dialog).getByRole('button', { name: 'Legalizar viaje SV-2026-0001' }),
  );
  await vi.waitFor(() => {
    const call = sent.find((request) => request.path.endsWith('/legalization'));
    expect(call?.headers['If-Match']).toBe('"3"');
  });
}

describe('viajes y legalizaciones (B33)', () => {
  it('dice el saldo en palabras', () => {
    expect(balanceText('30000.00')).toMatch(/El viajero debe devolver \$\s30\.000\./u);
    expect(balanceText('-70000.50')).toMatch(/Al viajero se le deben \$\s70\.000,5\./u);
    expect(balanceText('0.00')).toBe('Sin saldo: los gastos igualan el anticipo.');
  });

  it('el viajero legaliza su viaje aprobado con sus gastos', async () => {
    await legalizesTravel();
  });

  it('quien aprueba decide el viaje de otra persona, no el propio', async () => {
    const pending = { ...TRAVEL, status: 'in_approval', mine: false, expenses: [] };
    const own = { ...pending, id: ORDER_ID, code: 'SV-2026-0002', mine: true };
    serve(['purchase.read', 'purchase.travel.approve'], {
      'GET /v1/travel-requests': () => json({ data: [pending, own] }),
    });
    show(<TravelPanel />);
    expect(
      await screen.findByRole('button', { name: 'Aprobar el viaje SV-2026-0001' }),
    ).toBeVisible();
    expect(screen.getByText('Lo aprueba otra persona')).toBeVisible();
    expect(screen.queryByRole('button', { name: 'Aprobar el viaje SV-2026-0002' })).toBeNull();
  });
});

describe('portada de Compras (B33)', () => {
  it('muestra lo que cada permiso deja ver, incluidos los activos (B34)', async () => {
    serve(['purchase.request.create', 'asset.read']);
    show(<PurchasesHome />);
    expect(await screen.findByRole('link', { name: /Solicitudes de compra/u })).toBeVisible();
    expect(screen.queryByRole('link', { name: /Órdenes de compra/u })).toBeNull();
    expect(screen.queryByRole('link', { name: /Viajes y legalizaciones/u })).toBeNull();
    expect(screen.queryByText('Activos: disponible pronto')).toBeNull();
    const assets = screen.getByRole('link', { name: /^Activos/u });
    expect(assets).toHaveAttribute('href', '/app/compras/activos');
    expect(screen.getByRole('link', { name: /Mantenimientos de activos/u })).toBeVisible();
  });
});

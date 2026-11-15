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
  renderWithApi,
  type SentRequest,
} from '../../test-support/fake-api';
import { permissionsOf } from '../../test-support/party-fixtures';
import {
  ASSET,
  ASSET_ID,
  ASSIGNED,
  ASSIGNEES,
  CANCELLED_ASSIGNMENT,
  DONE_MAINTENANCE,
  HOLDER_ID,
  RESERVED,
  RETIRED,
  RETURNED_ASSIGNMENT,
} from './asset-fixtures';
import { AssetsPanel } from './assets-panel';

// Inventario de activos (B34): lo que ve cada quien, el alta, la asignación en comodato, el libro
// y el historial.

vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace: vi.fn(), push: vi.fn() }),
  usePathname: () => '/app/compras/activos',
}));

const ASSETS = '/v1/assets';
const MANAGER: readonly PermissionCode[] = [
  'asset.read',
  'asset.manage',
  'asset.assign',
  'asset.retire',
];

function serve(permissions: object, extra: object = {}): SentRequest[] {
  return mockApi({
    'GET /v1/auth/session': () => json(SESSION),
    'GET /v1/me/permissions': () => json(permissions),
    [`GET ${ASSETS}`]: () => json({ data: [ASSET, RESERVED, ASSIGNED, RETIRED] }),
    ...extra,
  });
}

function show(panel: JSX.Element): void {
  renderWithApi(<Screen>{panel}</Screen>);
}

function sentTo(sent: readonly SentRequest[], ending: string): SentRequest | undefined {
  return sent.find((request) => request.method === 'POST' && request.path.endsWith(ending));
}

beforeEach(() => {
  vi.stubGlobal('scrollTo', vi.fn());
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('inventario de activos (B34)', () => {
  it('muestra cada activo con su estado, su responsable y su valor en libros', async () => {
    serve(permissionsOf(MANAGER));
    show(<AssetsPanel />);
    expect(await screen.findByRole('heading', { name: 'Activos' })).toBeVisible();
    expect(screen.getByText('Portátil de desarrollo')).toBeVisible();
    expect(screen.getByText('Equipo de cómputo · Serie SN-001')).toBeVisible();
    expect(screen.getByText('Comodato CT-ADM-001-2026-0001 firmado')).toBeVisible();
    expect(screen.getByText('En firma · firma hasta el 16/11/2026')).toBeVisible();
    expect(screen.getByText('Baja del 30/10/2026')).toBeVisible();
    expect(screen.getAllByText('Ana Gómez')).toHaveLength(2);
    expect(screen.getAllByText(/2.700.000/u)).not.toHaveLength(0);
  });

  it('ofrece a quien administra la acción que corresponde a cada estado', async () => {
    serve(permissionsOf(MANAGER));
    show(<AssetsPanel />);
    expect(await screen.findByRole('button', { name: 'Asignar ACT-2026-0001' })).toBeVisible();
    expect(screen.getByRole('button', { name: 'Dar de baja ACT-2026-0001' })).toBeVisible();
    expect(screen.getByRole('button', { name: 'Anular asignación ACT-2026-0002' })).toBeVisible();
    expect(screen.queryByRole('button', { name: 'Asignar ACT-2026-0002' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Dar de baja ACT-2026-0002' })).toBeNull();
    expect(screen.getAllByRole('button', { name: /Registrar devolución/u })).toHaveLength(1);
    expect(
      screen.queryByRole('button', { name: 'Programar mantenimiento ACT-2026-0003' }),
    ).toBeNull();
    expect(screen.getByRole('button', { name: 'Ver historial ACT-2026-0003' })).toBeVisible();
  });
});

describe('lo que ve un colaborador (B34)', () => {
  it('el colaborador ve «Mis activos», sin registrar, asignar ni descargar el libro', async () => {
    const own = { roles: [], permissions: [{ code: 'asset.read', scope: 'own' }] };
    serve(own, { [`GET ${ASSETS}`]: () => json({ data: [ASSIGNED] }) });
    show(<AssetsPanel />);
    expect(await screen.findByRole('heading', { name: 'Mis activos' })).toBeVisible();
    expect(await screen.findByText('Comodato CT-ADM-001-2026-0001 firmado')).toBeVisible();
    expect(screen.queryByRole('button', { name: 'Registrar activo' })).toBeNull();
    expect(screen.queryByRole('button', { name: /Descargar libro/u })).toBeNull();
    expect(screen.queryByRole('button', { name: /Registrar devolución/u })).toBeNull();
  });

  it('avisa cuando aún no hay activos', async () => {
    serve(permissionsOf(['asset.read']), { [`GET ${ASSETS}`]: () => json({ data: [] }) });
    show(<AssetsPanel />);
    expect(await screen.findByText('Aún no hay activos')).toBeVisible();
  });
});

async function registersAsset(): Promise<void> {
  const sent = serve(permissionsOf(MANAGER), {
    [`POST ${ASSETS}`]: () => json({ id: ASSET_ID }, 201),
  });
  show(<AssetsPanel />);
  await userEvent.click(await screen.findByRole('button', { name: 'Registrar activo' }));
  const dialog = await screen.findByRole('dialog');
  await userEvent.click(within(dialog).getByRole('button', { name: 'Registrar activo' }));
  expect(await within(dialog).findAllByText('Escriba la fecha.')).not.toHaveLength(0);
  expect(sentTo(sent, ASSETS)).toBeUndefined();
  await userEvent.type(within(dialog).getByLabelText('Nombre'), 'Portátil nuevo');
  await userEvent.selectOptions(within(dialog).getByLabelText('Categoría'), 'computer');
  await userEvent.type(within(dialog).getByLabelText('Fecha de compra'), '2026-11-01');
  await userEvent.type(within(dialog).getByLabelText('Costo'), '4500000,50');
  await userEvent.type(within(dialog).getByLabelText('Vida útil (meses)'), '36');
  await userEvent.click(within(dialog).getByRole('button', { name: 'Registrar activo' }));
  await vi.waitFor(() => {
    expect(sentTo(sent, ASSETS)?.body).toEqual({
      name: 'Portátil nuevo',
      category: 'computer',
      serial: null,
      purchase_date: '2026-11-01',
      cost: '4500000.50',
      useful_life_months: 36,
      location: null,
    });
  });
  expect(sentTo(sent, ASSETS)?.headers['Idempotency-Key']).toMatch(/^[0-9a-f-]{36}$/u);
}

async function assignsAsset(): Promise<void> {
  const sent = serve(permissionsOf(MANAGER), {
    'GET /v1/asset-assignees': () => json(ASSIGNEES),
    [`POST ${ASSETS}/${ASSET_ID}/assignments`]: () =>
      apiError(422, 'AST_HOLDER_NOT_READY', 'Falta vincular a la persona en Terceros.'),
  });
  show(<AssetsPanel />);
  await userEvent.click(await screen.findByRole('button', { name: 'Asignar ACT-2026-0001' }));
  const dialog = await screen.findByRole('dialog');
  const people = within(dialog).getByLabelText('Colaborador');
  expect(await within(people).findByText(/Luis Pérez \(falta vincular/u)).toBeVisible();
  await userEvent.selectOptions(people, HOLDER_ID);
  await userEvent.type(within(dialog).getByLabelText('Fecha de entrega'), '2026-11-12');
  await userEvent.click(within(dialog).getByRole('button', { name: 'Asignar y enviar a firma' }));
  expect(await within(dialog).findByText('Falta vincular a la persona en Terceros.')).toBeVisible();
  expect(sentTo(sent, '/assignments')?.body).toEqual({
    user_id: HOLDER_ID,
    assigned_on: '2026-11-12',
    message: null,
  });
}

describe('alta y asignación de un activo (B34)', () => {
  it('el formulario de alta pide lo obligatorio y envía el costo con punto decimal', async () => {
    await registersAsset();
  });

  it('asigna a un colaborador y muestra el mensaje si la API lo rechaza', async () => {
    await assignsAsset();
  });
});

describe('libro e historial de activos (B34)', () => {
  it('descarga el libro de activos', async () => {
    const createObjectURL = vi.fn(() => 'blob:libro');
    vi.stubGlobal('URL', Object.assign(URL, { createObjectURL, revokeObjectURL: vi.fn() }));
    const csv = new Response('Código;Nombre\r\n', {
      headers: { 'Content-Disposition': 'attachment; filename="libro-de-activos-2026-11-12.csv"' },
    });
    const sent = serve(permissionsOf(MANAGER), { [`POST ${ASSETS}/book/export`]: () => csv });
    show(<AssetsPanel />);
    await userEvent.click(
      await screen.findByRole('button', { name: 'Descargar libro de activos' }),
    );
    expect(
      await screen.findByText('Descargamos libro-de-activos-2026-11-12.csv.'),
    ).toBeInTheDocument();
    expect(sentTo(sent, '/book/export')?.body).toEqual({});
    expect(createObjectURL).toHaveBeenCalledOnce();
  });
});

describe('historial de un activo (B34)', () => {
  it('el historial muestra asignaciones y mantenimientos, o que no hay', async () => {
    const detail = {
      asset: ASSET,
      assignments: [RETURNED_ASSIGNMENT, CANCELLED_ASSIGNMENT],
      maintenance: [DONE_MAINTENANCE],
    };
    serve(permissionsOf(MANAGER), {
      [`GET ${ASSETS}/${ASSET_ID}`]: () => json(detail),
      [`GET ${ASSETS}/${RETIRED.id}`]: () => json({ ...detail, assignments: [], maintenance: [] }),
    });
    show(<AssetsPanel />);
    await userEvent.click(
      await screen.findByRole('button', { name: 'Ver historial ACT-2026-0001' }),
    );
    const dialog = await screen.findByRole('dialog');
    expect(await within(dialog).findByText('Devuelto el 01/10/2026: En buen estado')).toBeVisible();
    expect(within(dialog).getByText('El colaborador rechazó el comodato.')).toBeVisible();
    expect(within(dialog).getByText('Correctivo')).toBeVisible();
    expect(within(dialog).getByText(/120.000/u)).toBeVisible();
    await userEvent.keyboard('{Escape}');
    await userEvent.click(screen.getByRole('button', { name: 'Ver historial ACT-2026-0003' }));
    const empty = await screen.findByRole('dialog');
    expect(await within(empty).findByText('Sin asignaciones registradas.')).toBeVisible();
    expect(within(empty).getByText('Sin mantenimientos registrados.')).toBeVisible();
  });
});

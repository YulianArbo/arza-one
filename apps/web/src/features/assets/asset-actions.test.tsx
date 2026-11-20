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
import {
  ASSET,
  ASSET_ID,
  ASSIGNED,
  ASSIGNMENT_ID,
  DONE_MAINTENANCE,
  MAINTENANCE,
  MAINTENANCE_ID,
  RESERVED,
} from './asset-fixtures';
import { AssetsPanel } from './assets-panel';
import { MaintenancePanel } from './maintenance-panel';

// Acciones sobre un activo (B34): anular la asignación, devolución, baja y mantenimientos, con la
// versión del registro que se vio.

vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace: vi.fn(), push: vi.fn() }),
  usePathname: () => '/app/compras/activos',
}));

const ASSETS = '/v1/assets';
const MAINTENANCES = '/v1/asset-maintenance';
const MANAGER: readonly PermissionCode[] = [
  'asset.read',
  'asset.manage',
  'asset.assign',
  'asset.retire',
];

function serve(extra: object, permissions: readonly PermissionCode[] = MANAGER): SentRequest[] {
  return mockApi({
    'GET /v1/auth/session': () => json(SESSION),
    'GET /v1/me/permissions': () => json(permissionsOf(permissions)),
    [`GET ${ASSETS}`]: () => json({ data: [ASSET, RESERVED, ASSIGNED] }),
    ...extra,
  });
}

function show(panel: JSX.Element): void {
  renderWithApi(<Screen>{panel}</Screen>);
}

function sentTo(sent: readonly SentRequest[], ending: string): SentRequest | undefined {
  return sent.find((request) => request.method !== 'GET' && request.path.endsWith(ending));
}

async function openDialog(button: string): Promise<HTMLElement> {
  await userEvent.click(await screen.findByRole('button', { name: button }));
  return screen.findByRole('dialog');
}

beforeEach(() => {
  vi.stubGlobal('scrollTo', vi.fn());
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('asignaciones de un activo (B34)', () => {
  it('anula con motivo una asignación pendiente de firma', async () => {
    const sent = serve({
      [`POST /v1/asset-assignments/${ASSIGNMENT_ID}/cancellation`]: () => noContent(),
    });
    show(<AssetsPanel />);
    const dialog = await openDialog('Anular asignación ACT-2026-0002');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Anular asignación' }));
    expect(sentTo(sent, '/cancellation')).toBeUndefined();
    await userEvent.type(within(dialog).getByLabelText('Motivo'), 'Colaborador equivocado');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Anular asignación' }));
    await vi.waitFor(() => {
      expect(sentTo(sent, '/cancellation')?.body).toEqual({ reason: 'Colaborador equivocado' });
    });
    expect(sentTo(sent, '/cancellation')?.headers['If-Match']).toBe('"2"');
  });

  it('registra la devolución con su fecha y el estado del activo', async () => {
    const sent = serve({
      [`POST /v1/asset-assignments/${ASSIGNMENT_ID}/return`]: () => noContent(),
    });
    show(<AssetsPanel />);
    const dialog = await openDialog('Registrar devolución ACT-2026-0004');
    await userEvent.type(within(dialog).getByLabelText('Fecha de devolución'), '2026-11-12');
    await userEvent.type(within(dialog).getByLabelText('Estado en que se devuelve'), 'Buen estado');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Registrar devolución' }));
    await vi.waitFor(() => {
      expect(sentTo(sent, '/return')?.body).toEqual({
        returned_on: '2026-11-12',
        note: 'Buen estado',
      });
    });
    expect(sentTo(sent, '/return')?.headers['If-Match']).toBe('"3"');
  });
});

async function retiresAsset(): Promise<void> {
  const sent = serve({
    [`POST ${ASSETS}/${ASSET_ID}/retirement`]: () =>
      apiError(409, 'AST_STATUS_INVALID', 'El activo está asignado o pendiente de firma.'),
  });
  show(<AssetsPanel />);
  const dialog = await openDialog('Dar de baja ACT-2026-0001');
  await userEvent.click(within(dialog).getByRole('button', { name: 'Dar de baja' }));
  expect(await within(dialog).findByText(/Escriba el código ACT-2026-0001/u)).toBeVisible();
  await userEvent.type(
    within(dialog).getByLabelText('Para confirmar, escriba el código ACT-2026-0001'),
    'act-2026-0001',
  );
  await userEvent.click(within(dialog).getByRole('button', { name: 'Dar de baja' }));
  expect(await within(dialog).findAllByText('Escriba la fecha.')).not.toHaveLength(0);
  await userEvent.type(within(dialog).getByLabelText('Fecha de baja'), '2026-11-12');
  await userEvent.selectOptions(within(dialog).getByLabelText('Motivo'), 'obsolescence');
  await userEvent.type(within(dialog).getByLabelText('Detalle'), 'Equipo obsoleto');
  await userEvent.click(within(dialog).getByRole('button', { name: 'Dar de baja' }));
  expect(
    await within(dialog).findByText('El activo está asignado o pendiente de firma.'),
  ).toBeVisible();
  expect(sentTo(sent, '/retirement')?.body).toEqual({
    retired_on: '2026-11-12',
    reason: 'obsolescence',
    note: 'Equipo obsoleto',
  });
  expect(sentTo(sent, '/retirement')?.headers['If-Match']).toBe('"1"');
}

async function schedulesMaintenance(): Promise<void> {
  const sent = serve({
    [`POST ${ASSETS}/${ASSET_ID}/maintenance`]: () => json({ id: MAINTENANCE_ID }, 201),
  });
  show(<AssetsPanel />);
  const dialog = await openDialog('Programar mantenimiento ACT-2026-0001');
  await userEvent.selectOptions(within(dialog).getByLabelText('Tipo'), 'preventive');
  await userEvent.type(within(dialog).getByLabelText('Fecha programada'), '2026-11-20');
  await userEvent.click(within(dialog).getByRole('button', { name: 'Programar mantenimiento' }));
  await vi.waitFor(() => {
    expect(sentTo(sent, '/maintenance')?.body).toEqual({
      kind: 'preventive',
      scheduled_on: '2026-11-20',
      note: null,
    });
  });
}

describe('baja y mantenimiento desde el inventario (B34)', () => {
  it('da de baja con fecha, motivo y detalle, y muestra el rechazo de la API', async () => {
    await retiresAsset();
  });

  it('programa un mantenimiento para un activo', async () => {
    await schedulesMaintenance();
  });
});

async function completesMaintenance(): Promise<void> {
  const sent = serve({
    [`GET ${MAINTENANCES}`]: () => json({ data: [MAINTENANCE, DONE_MAINTENANCE] }),
    [`POST ${MAINTENANCES}/${MAINTENANCE_ID}/completion`]: () => noContent(),
    [`DELETE ${MAINTENANCES}/${MAINTENANCE_ID}`]: () => noContent(),
  });
  show(<MaintenancePanel />);
  expect(await screen.findByText('Pendiente')).toBeVisible();
  expect(screen.getByText('Hecho')).toBeVisible();
  expect(screen.getByText(/120.000/u)).toBeVisible();
  expect(await screen.findAllByRole('button', { name: /Registrar como hecho/u })).toHaveLength(1);
  const dialog = await openDialog('Registrar como hecho el mantenimiento de ACT-2026-0001');
  await userEvent.type(within(dialog).getByLabelText('Fecha en que se hizo'), '2026-11-12');
  await userEvent.type(within(dialog).getByLabelText('Costo'), '80000');
  await userEvent.click(within(dialog).getByRole('button', { name: 'Registrar como hecho' }));
  await vi.waitFor(() => {
    expect(sentTo(sent, '/completion')?.body).toEqual({
      done_on: '2026-11-12',
      cost: '80000',
      note: null,
    });
  });
  expect(sentTo(sent, '/completion')?.headers['If-Match']).toBe('"1"');
}

describe('mantenimientos de activos (B34)', () => {
  it('registra como hecho un mantenimiento pendiente, con su costo', async () => {
    await completesMaintenance();
  });

  it('quita un mantenimiento programado por error', async () => {
    const sent = serve({
      [`GET ${MAINTENANCES}`]: () => json({ data: [MAINTENANCE] }),
      [`DELETE ${MAINTENANCES}/${MAINTENANCE_ID}`]: () => noContent(),
    });
    show(<MaintenancePanel />);
    const remove = 'Quitar el mantenimiento programado de ACT-2026-0001';
    await userEvent.click(await screen.findByRole('button', { name: remove }));
    await vi.waitFor(() => {
      expect(sent.some((request) => request.method === 'DELETE')).toBe(true);
    });
  });

  it('quien solo consulta no ve acciones, y sin registros lo dice', async () => {
    serve({ [`GET ${MAINTENANCES}`]: () => json({ data: [MAINTENANCE] }) }, ['asset.read']);
    show(<MaintenancePanel />);
    expect(await screen.findByText('Pendiente')).toBeVisible();
    expect(screen.queryByRole('button', { name: /Registrar como hecho/u })).toBeNull();
  });

  it('avisa cuando aún no hay mantenimientos', async () => {
    serve({ [`GET ${MAINTENANCES}`]: () => json({ data: [] }) });
    show(<MaintenancePanel />);
    expect(await screen.findByText('Aún no hay mantenimientos')).toBeVisible();
  });
});

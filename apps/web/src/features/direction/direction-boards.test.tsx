import type { PermissionCode } from '@arza/contracts';
import { screen, within } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

import { json, mockApi, SESSION } from '../../test-support/fake-api';
import { permissionsOf } from '../../test-support/party-fixtures';
import { show } from '../sst/sst-test-support';
import { CompliancePage, DirectionHome, ExecutivePage, ScorecardPage } from './direction-home';
import { EXECUTIVE, SALES_ROWS, SCORECARD } from './direction-fixtures';

// Tableros de la Dirección (B46): cifras con su formato, sin permiso no se ven, cada una lleva a
// sus registros, y el cuadro de mando con sus perspectivas.

vi.mock('next/navigation', () => ({
  usePathname: () => '/app/direccion',
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
}));

beforeEach(() => {
  vi.stubGlobal('scrollTo', vi.fn());
});
afterEach(() => vi.unstubAllGlobals());

const BOARDS: readonly PermissionCode[] = [
  'dashboard.executive.read',
  'dashboard.process.read',
  'dashboard.compliance.read',
  'qms.read',
];

function serve(routes: object, codes: readonly PermissionCode[] = BOARDS): void {
  mockApi({
    'GET /v1/auth/session': () => json(SESSION),
    'GET /v1/me/permissions': () => json(permissionsOf(codes)),
    ...routes,
  });
}

it('el tablero gerencial muestra cada cifra con su formato y oculta la que no tiene permiso', async () => {
  serve({ 'GET /v1/dashboards/executive/data': () => json(EXECUTIVE) });
  show(<ExecutivePage />);
  expect(await screen.findByText(/1\.234\.568/u)).toBeVisible();
  expect(screen.getByText('87,5 %')).toBeVisible();
  expect(screen.getByText('Sin datos')).toBeVisible();
  expect(screen.getByText('No tiene permiso para ver este dato.')).toBeVisible();
  expect(screen.getByText(/hora de Colombia/u)).toBeVisible();
  expect(screen.getAllByRole('button', { name: 'Ver registros' })).toHaveLength(3);
});

it('«Ver registros» muestra los registros que originan la cifra y el enlace al listado', async () => {
  serve({
    'GET /v1/dashboards/executive/data': () => json(EXECUTIVE),
    'GET /v1/dashboards/executive/drilldown': () => json(SALES_ROWS),
  });
  show(<ExecutivePage />);
  await screen.findByText(/1\.234\.568/u);
  const [first] = screen.getAllByRole('button', { name: 'Ver registros' });
  if (first === undefined) throw new Error('Falta el botón');
  await userEvent.click(first);
  const dialog = await screen.findByRole('dialog');
  expect(await within(dialog).findByText('FAC-2026-0001')).toBeVisible();
  expect(within(dialog).getByRole('link', { name: 'Ir al listado completo' })).toHaveAttribute(
    'href',
    '/app/finanzas/facturas',
  );
});

it('el tablero de cumplimiento ofrece reintentar si falla la consulta', async () => {
  serve({
    'GET /v1/dashboards/compliance/data': () =>
      json({ code: 'INTERNAL', message: 'Falla', correlation_id: 'abc' }, 500),
  });
  show(<CompliancePage />);
  expect(await screen.findByRole('button', { name: /Reintentar/u })).toBeVisible();
});

it('el cuadro de mando muestra las perspectivas, el estado y lo propio', async () => {
  serve({ 'GET /v1/dashboards/scorecard/data': () => json(SCORECARD) });
  show(<ScorecardPage />);
  expect(await screen.findByText('OBJ-001 · Clientes más satisfechos')).toBeVisible();
  expect(screen.getByText('Cumple en parte')).toBeVisible();
  expect(screen.getByText(/procesos de su cargo/u)).toBeVisible();
  expect(screen.getByText('Sin medición')).toBeVisible();
  expect(screen.getAllByText('Sin objetivos en esta perspectiva.')).toHaveLength(3);
  expect(screen.queryByRole('button', { name: 'Registrar objetivo' })).toBeNull();
});

it('la portada muestra solo las partes que la persona puede ver', async () => {
  serve({}, ['dashboard.process.read']);
  show(<DirectionHome />);
  expect(await screen.findByRole('link', { name: 'Cuadro de mando' })).toBeVisible();
  expect(screen.queryByRole('link', { name: 'Tablero gerencial' })).toBeNull();
  expect(screen.queryByRole('link', { name: 'Normograma' })).toBeNull();
});

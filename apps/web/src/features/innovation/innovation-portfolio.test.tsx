import type { PermissionCode } from '@arza/contracts';
import { screen, within } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

import { json, mockApi, noContent, SESSION, type SentRequest } from '../../test-support/fake-api';
import { permissionsOf } from '../../test-support/party-fixtures';
import { openDialog, sentTo, show } from '../sst/sst-test-support';
import { ASSET, INN_ID, ITEM, ME, OTHER, SOFTWARE } from './innovation-fixtures';
import { InnovationAssetDetail } from './innovation-asset-detail';
import { InnovationPortfolio } from './innovation-portfolio';
import { InnovationRoadmap } from './innovation-roadmap';
import { InnovationWatch } from './innovation-watch';

// Hoja de ruta, portafolio con su cadena de titularidad y vigilancia (B40).

vi.mock('next/navigation', () => ({
  usePathname: () => '/app/innovacion',
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
}));

beforeEach(() => {
  vi.stubGlobal('scrollTo', vi.fn());
});
afterEach(() => vi.unstubAllGlobals());

const MANAGER: readonly PermissionCode[] = [
  'inn.read',
  'inn.roadmap.manage',
  'inn.ip.manage',
  'inn.watch.manage',
];
const READER: readonly PermissionCode[] = ['inn.read'];

function serve(routes: object, codes: readonly PermissionCode[]): SentRequest[] {
  return mockApi({
    'GET /v1/auth/session': () => json(SESSION),
    'GET /v1/me/permissions': () => json(permissionsOf(codes)),
    'GET /v1/innovation/people': () => json({ data: [ME, OTHER] }),
    'GET /v1/innovation/ideas': () => json({ data: [] }),
    ...routes,
  });
}

it('Calidad libera una versión de la hoja de ruta', async () => {
  const sent = serve(
    {
      'GET /v1/innovation/roadmap': () => json({ data: [ITEM], products: ['ARZA ONE'] }),
      [`POST /v1/innovation/roadmap/${ITEM.id}/release`]: () => json({ ip_asset_id: INN_ID(99) }),
    },
    MANAGER,
  );
  show(<InnovationRoadmap />);
  expect(await screen.findByText(/Portal de clientes/u)).toBeInTheDocument();
  const dialog = await openDialog('Liberar versión');
  await userEvent.type(within(dialog).getByLabelText('Versión liberada, como 1.2.0'), '2.0.0');
  await userEvent.click(within(dialog).getByRole('button', { name: 'Liberar' }));
  await vi.waitFor(() => {
    const release = sentTo(sent, '/release');
    expect(release?.body).toMatchObject({ version_label: '2.0.0' });
    expect(release?.headers['If-Match']).toBe('"2"');
  });
});

it('el portafolio muestra la alerta de renovación; quien solo lee no registra', async () => {
  serve({ 'GET /v1/innovation/ip-assets': () => json({ data: [ASSET, SOFTWARE] }) }, READER);
  show(<InnovationPortfolio />);
  expect(await screen.findByText('Renovación por gestionar')).toBeInTheDocument();
  expect(screen.getByText(/faltan 170 días/u)).toBeInTheDocument();
  expect(screen.getByText(/No vence/u)).toBeInTheDocument();
  expect(screen.queryByRole('button', { name: 'Registrar activo' })).not.toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Descargar portafolio (CSV)' })).toBeInTheDocument();
});

it('Calidad registra una marca con sus fechas', async () => {
  const sent = serve(
    {
      'GET /v1/innovation/ip-assets': () => json({ data: [] }),
      'POST /v1/innovation/ip-assets': () => json({ id: INN_ID(98), code: 'PI-2026-0009' }, 201),
    },
    MANAGER,
  );
  show(<InnovationPortfolio />);
  const dialog = await openDialog('Registrar activo');
  await userEvent.selectOptions(within(dialog).getByLabelText('Tipo'), 'trademark');
  await userEvent.type(
    within(dialog).getByLabelText('Nombre de la marca, del software o del dominio'),
    'ARZA TECH',
  );
  await userEvent.type(within(dialog).getByLabelText('Titular'), 'Empresa de prueba S.A.S.');
  await userEvent.selectOptions(within(dialog).getByLabelText('Responsable'), ME.id);
  await userEvent.click(within(dialog).getByRole('button', { name: 'Registrar' }));
  await vi.waitFor(() => {
    expect(sentTo(sent, '/v1/innovation/ip-assets')?.body).toMatchObject({
      kind: 'trademark',
      title: 'ARZA TECH',
      expires_on: null,
      certificate_file_id: null,
    });
  });
});

it('la ficha muestra los autores y Calidad quita uno', async () => {
  const path = `/v1/innovation/ip-assets/${SOFTWARE.id}`;
  const sent = serve(
    {
      [`GET ${path}`]: () => json(SOFTWARE),
      [`DELETE ${path}/authors/${INN_ID(40)}`]: () => noContent(),
    },
    MANAGER,
  );
  show(<InnovationAssetDetail id={SOFTWARE.id} />);
  expect(await screen.findByText('Autora externa')).toBeInTheDocument();
  expect(screen.getByText(/cesion.pdf/u)).toBeInTheDocument();
  await userEvent.click(
    await screen.findByRole('button', { name: 'Quitar a Autora externa de los autores' }),
  );
  await vi.waitFor(() => {
    expect(sent.some((request) => request.method === 'DELETE')).toBe(true);
  });
  const add = await openDialog('Agregar autor');
  await userEvent.selectOptions(within(add).getByLabelText('Soporte de la cesión'), 'contract');
  await userEvent.click(within(add).getByRole('button', { name: 'Agregar autor' }));
  expect(await within(add).findByRole('alert')).toBeInTheDocument();
});

it('vigilancia y competencia se listan y se registran', async () => {
  const sent = serve(
    {
      'GET /v1/innovation/watch': () => json({ data: [] }),
      'GET /v1/innovation/competitors': () => json({ data: [] }),
      'POST /v1/innovation/watch': () => json({ id: INN_ID(97) }, 201),
    },
    MANAGER,
  );
  show(<InnovationWatch />);
  expect(await screen.findByText('Aún no hay hallazgos registrados.')).toBeInTheDocument();
  expect(await screen.findByText('Aún no hay competidores registrados.')).toBeInTheDocument();
  const dialog = await openDialog('Registrar hallazgo');
  await userEvent.type(within(dialog).getByLabelText('Tema vigilado'), 'Facturación');
  await userEvent.type(within(dialog).getByLabelText('Fuente'), 'Resolución DIAN');
  await userEvent.type(within(dialog).getByLabelText('Hallazgo'), 'Cambia el anexo técnico.');
  await userEvent.selectOptions(within(dialog).getByLabelText('Relevancia'), 'high');
  await userEvent.click(within(dialog).getByRole('button', { name: 'Registrar' }));
  await vi.waitFor(() => {
    expect(sentTo(sent, '/v1/innovation/watch')?.body).toMatchObject({ relevance: 'high' });
  });
});

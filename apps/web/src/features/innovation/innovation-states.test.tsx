import type { PermissionCode } from '@arza/contracts';
import { screen, within } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

import { json, mockApi, noContent, SESSION, type SentRequest } from '../../test-support/fake-api';
import { permissionsOf } from '../../test-support/party-fixtures';
import { openDialog, sentTo, show } from '../sst/sst-test-support';
import { ASSET, EVALUATED, IDEA, INN_ID, ITEM, ME, OTHER, OWN_IDEA } from './innovation-fixtures';
import { InnovationAssetDetail } from './innovation-asset-detail';
import { InnovationHome } from './innovation-home';
import { InnovationIdeas } from './innovation-ideas';
import { InnovationPortfolio } from './innovation-portfolio';
import { InnovationRoadmap } from './innovation-roadmap';
import { InnovationWatch } from './innovation-watch';

// Estados de las pantallas de Innovación (B40): cada etapa de la idea, lo liberado, lo vencido, el
// certificado, la cadena con aportes y los registros de vigilancia y competencia.

vi.mock('next/navigation', () => ({
  usePathname: () => '/app/innovacion',
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
}));

beforeEach(() => {
  vi.stubGlobal('scrollTo', vi.fn());
});
afterEach(() => vi.unstubAllGlobals());

const ALL: readonly PermissionCode[] = [
  'inn.read',
  'inn.idea.create',
  'inn.idea.evaluate',
  'inn.idea.approve',
  'inn.roadmap.manage',
  'inn.ip.manage',
  'inn.watch.manage',
];

function serve(routes: object, codes: readonly PermissionCode[] = ALL): SentRequest[] {
  return mockApi({
    'GET /v1/auth/session': () => json(SESSION),
    'GET /v1/me/permissions': () => json(permissionsOf(codes)),
    'GET /v1/innovation/people': () => json({ data: [ME, OTHER] }),
    ...routes,
  });
}

const APPROVED = {
  ...EVALUATED,
  id: INN_ID(13),
  code: 'IDE-2026-0004',
  stage: 'approved' as const,
  decision_note: 'Va para el primer trimestre.',
  decided_by: ME,
  decided_on: '2026-11-21',
  version: 4,
};
const DEVELOPING = {
  ...APPROVED,
  id: INN_ID(14),
  code: 'IDE-2026-0005',
  stage: 'in_development' as const,
};
const ARCHIVED = { ...IDEA, id: INN_ID(15), code: 'IDE-2026-0006', stage: 'archived' as const };

it('cada etapa de la idea muestra solo sus pasos', async () => {
  const sent = serve({
    'GET /v1/innovation/ideas': () => json({ data: [APPROVED, DEVELOPING, ARCHIVED] }),
    [`POST /v1/innovation/ideas/${APPROVED.id}/progress`]: () => noContent(),
    [`POST /v1/innovation/ideas/${DEVELOPING.id}/decision`]: () => noContent(),
  });
  show(<InnovationIdeas />);
  expect(await screen.findAllByText(/Decisión: Va para el primer trimestre/u)).toHaveLength(2);
  await userEvent.click(
    await screen.findByRole('button', { name: 'Pasar a desarrollo: IDE-2026-0004' }),
  );
  await vi.waitFor(() => {
    expect(sentTo(sent, '/progress')?.body).toEqual({ stage: 'in_development' });
  });
  expect(
    screen.getByRole('button', { name: 'Marcar implementada: IDE-2026-0005' }),
  ).toBeInTheDocument();
  expect(screen.getAllByRole('button', { name: /Descargar la evaluación/u })).toHaveLength(2);
  const decision = (await screen.findAllByRole('button', { name: 'Aprobar o archivar' }))[1];
  if (decision === undefined) throw new Error('Falta la decisión');
  await userEvent.click(decision);
  const dialog = await screen.findByRole('dialog');
  await userEvent.selectOptions(within(dialog).getByLabelText('Decisión'), 'archive');
  await userEvent.type(within(dialog).getByLabelText('Por qué'), 'Se pospone un año.');
  await userEvent.click(within(dialog).getByRole('button', { name: 'Registrar decisión' }));
  await vi.waitFor(() => {
    expect(sentTo(sent, '/decision')?.body).toMatchObject({ decision: 'archive' });
  });
});

it('el colaborador corrige su idea inscrita', async () => {
  const sent = serve(
    {
      'GET /v1/innovation/my/ideas': () => json({ data: [OWN_IDEA, ARCHIVED] }),
      [`PATCH /v1/innovation/ideas/${OWN_IDEA.id}`]: () => noContent(),
    },
    ['inn.idea.create'],
  );
  show(<InnovationHome />);
  const dialog = await openDialog('Corregir');
  const title = within(dialog).getByLabelText('Nombre corto de la idea');
  await userEvent.clear(title);
  await userEvent.type(title, 'Conciliación automática');
  await userEvent.click(within(dialog).getByRole('button', { name: 'Guardar' }));
  await vi.waitFor(() => {
    const patch = sentTo(sent, `/ideas/${OWN_IDEA.id}`);
    expect(patch?.body).toMatchObject({ title: 'Conciliación automática' });
    expect(patch?.headers['If-Match']).toBe('"1"');
  });
});

it('la hoja de ruta muestra lo liberado con su registro y agrega hitos', async () => {
  const released = {
    ...ITEM,
    id: INN_ID(21),
    status: 'released' as const,
    description: 'Clientes ven sus facturas.',
    idea: { id: APPROVED.id, code: APPROVED.code, title: APPROVED.title },
    version_label: '1.0.0',
    released_on: '2026-11-20',
    ip_asset: { id: INN_ID(30), code: 'PI-2026-0001' },
  };
  const sent = serve({
    'GET /v1/innovation/roadmap': () => json({ data: [released], products: [] }),
    'GET /v1/innovation/ideas': () => json({ data: [APPROVED, IDEA] }),
    'POST /v1/innovation/roadmap': () => json({ id: INN_ID(22) }, 201),
  });
  show(<InnovationRoadmap />);
  expect(
    await screen.findByRole('link', { name: 'Registro propuesto PI-2026-0001' }),
  ).toBeInTheDocument();
  expect(screen.getByText(/versión 1.0.0 liberada/u)).toBeInTheDocument();
  expect(screen.queryByRole('button', { name: 'Liberar versión' })).not.toBeInTheDocument();
  const dialog = await openDialog('Agregar hito');
  await userEvent.type(within(dialog).getByLabelText('Producto'), 'ARZA ONE');
  await userEvent.type(within(dialog).getByLabelText('Hito o funcionalidad'), 'Tablero');
  await userEvent.type(within(dialog).getByLabelText('Trimestre, como 2027-T1'), '2027-T2');
  await userEvent.selectOptions(within(dialog).getByLabelText('Responsable'), OTHER.id);
  await userEvent.click(within(dialog).getByRole('button', { name: 'Agregar' }));
  await vi.waitFor(() => {
    expect(sentTo(sent, '/v1/innovation/roadmap')?.body).toMatchObject({
      quarter: '2027-T2',
      idea_id: null,
      description: null,
    });
  });
});

it('el portafolio distingue lo vencido, el dominio y el software sin cesión', async () => {
  const expired = {
    ...ASSET,
    id: INN_ID(32),
    code: 'PI-2026-0003',
    status: 'expired' as const,
    renewal_due: false,
    days_to_expiry: -3,
  };
  const domain = {
    ...ASSET,
    id: INN_ID(33),
    code: 'PI-2026-0004',
    kind: 'domain' as const,
    nice_classes: null,
    registry_number: null,
    expires_on: null,
    days_to_expiry: null,
    renewal_due: false,
  };
  const bare = {
    ...ASSET,
    id: INN_ID(34),
    code: 'PI-2026-0005',
    kind: 'software' as const,
    expires_on: null,
    days_to_expiry: null,
    renewal_due: false,
    chain_complete: false,
  };
  serve({ 'GET /v1/innovation/ip-assets': () => json({ data: [expired, domain, bare] }) });
  show(<InnovationPortfolio />);
  expect(await screen.findByText(/venció hace 3 días/u)).toBeInTheDocument();
  expect(screen.getByText(/Sin vencimiento/u)).toBeInTheDocument();
  expect(screen.getByText('Sin cesión de autores')).toBeInTheDocument();
});

it('la ficha descarga el certificado y lista aportes; quien solo lee no gestiona', async () => {
  const withFile = {
    ...ASSET,
    notes: 'Renovada en 2017.',
    certificate: { id: INN_ID(50), file_name: 'certificado.pdf' },
    authors: [
      {
        id: INN_ID(41),
        name: OTHER.name,
        user_id: OTHER.id,
        contribution: 'Diseño del logotipo',
        support_kind: 'employment_contract' as const,
        support_label: 'CT-GTH-001-2026-0001',
      },
    ],
  };
  serve({ [`GET /v1/innovation/ip-assets/${ASSET.id}`]: () => json(withFile) }, ['inn.read']);
  show(<InnovationAssetDetail id={ASSET.id} />);
  expect(await screen.findByText(/Diseño del logotipo/u)).toBeInTheDocument();
  expect(
    await screen.findByRole('button', { name: 'Descargar el certificado de PI-2026-0001' }),
  ).toBeInTheDocument();
  expect(screen.queryByRole('button', { name: 'Agregar autor' })).not.toBeInTheDocument();
  expect(screen.queryByRole('button', { name: /Quitar/u })).not.toBeInTheDocument();
});

it('el certificado exige un archivo disponible', async () => {
  serve({ [`GET /v1/innovation/ip-assets/${ASSET.id}`]: () => json(ASSET) });
  show(<InnovationAssetDetail id={ASSET.id} />);
  const dialog = await openDialog('Adjuntar certificado');
  await userEvent.click(within(dialog).getByRole('button', { name: 'Adjuntar' }));
  expect(
    await within(dialog).findByText('Adjunte el certificado ya disponible.'),
  ).toBeInTheDocument();
});

it('vigilancia y competencia muestran sus registros y se editan', async () => {
  const finding = {
    id: INN_ID(60),
    topic: 'Firma electrónica',
    source: 'Boletín',
    finding: 'Nuevos requisitos.',
    relevance: 'low' as const,
    observed_on: '2026-11-01',
    recorded_by: ME,
    version: 1,
  };
  const rival = {
    id: INN_ID(61),
    name: 'Competidor S.A.S.',
    segment: 'ERP',
    website: 'https://competidor.example',
    strengths: 'Precio',
    weaknesses: 'Soporte',
    updated_on: '2026-11-02',
    version: 2,
  };
  const sent = serve({
    'GET /v1/innovation/watch': () => json({ data: [finding] }),
    'GET /v1/innovation/competitors': () => json({ data: [rival] }),
    [`PATCH /v1/innovation/competitors/${rival.id}`]: () => noContent(),
  });
  show(<InnovationWatch />);
  expect(await screen.findByText('Relevancia baja')).toBeInTheDocument();
  expect(await screen.findByText(/competidor.example/u)).toBeInTheDocument();
  const buttons = await screen.findAllByRole('button', { name: 'Actualizar' });
  const last = buttons.at(-1);
  if (last === undefined) throw new Error('Falta el botón');
  await userEvent.click(last);
  const dialog = await screen.findByRole('dialog');
  await userEvent.click(within(dialog).getByRole('button', { name: 'Guardar' }));
  await vi.waitFor(() => {
    expect(sentTo(sent, `/competitors/${rival.id}`)?.headers['If-Match']).toBe('"2"');
  });
});

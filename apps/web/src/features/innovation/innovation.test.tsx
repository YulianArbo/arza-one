import type { PermissionCode } from '@arza/contracts';
import { screen, within } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

import { json, mockApi, noContent, SESSION, type SentRequest } from '../../test-support/fake-api';
import { permissionsOf } from '../../test-support/party-fixtures';
import { openDialog, sentTo, show } from '../sst/sst-test-support';
import { EVALUATED, IDEA, INN_ID, ME, OTHER, OWN_IDEA } from './innovation-fixtures';
import { InnovationHome } from './innovation-home';
import { InnovationIdeas } from './innovation-ideas';

// Portada y banco de ideas (B40): todo colaborador propone; quien evalúa no lo hace con sus ideas.

vi.mock('next/navigation', () => ({
  usePathname: () => '/app/innovacion',
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
}));

beforeEach(() => {
  vi.stubGlobal('scrollTo', vi.fn());
});
afterEach(() => vi.unstubAllGlobals());

const WORKER: readonly PermissionCode[] = ['inn.idea.create'];
const QUALITY: readonly PermissionCode[] = [
  'inn.read',
  'inn.idea.create',
  'inn.idea.evaluate',
  'inn.idea.approve',
];

function serve(routes: object, codes: readonly PermissionCode[]): SentRequest[] {
  return mockApi({
    'GET /v1/auth/session': () => json(SESSION),
    'GET /v1/me/permissions': () => json(permissionsOf(codes)),
    'GET /v1/innovation/people': () => json({ data: [ME, OTHER] }),
    ...routes,
  });
}

it('el colaborador propone una idea y ve las suyas, sin indicadores del módulo', async () => {
  const sent = serve(
    {
      'GET /v1/innovation/my/ideas': () => json({ data: [OWN_IDEA] }),
      'POST /v1/innovation/ideas': () => json({ id: INN_ID(90), code: 'IDE-2026-0009' }, 201),
    },
    WORKER,
  );
  show(<InnovationHome />);
  expect(await screen.findByText('IDE-2026-0003')).toBeInTheDocument();
  expect(screen.queryByText('Ideas en evaluación')).not.toBeInTheDocument();
  const dialog = await openDialog('Proponer una idea');
  await userEvent.type(within(dialog).getByLabelText('Nombre corto de la idea'), 'Tablero');
  await userEvent.type(
    within(dialog).getByLabelText('Qué problema resuelve y qué propone'),
    'Un tablero de ventas para la Dirección.',
  );
  await userEvent.click(within(dialog).getByRole('button', { name: 'Proponer' }));
  await vi.waitFor(() => {
    expect(sentTo(sent, '/v1/innovation/ideas')?.body).toMatchObject({
      title: 'Tablero',
      expected_benefit: null,
    });
  });
});

it('quien lee Innovación ve los indicadores y las partes del módulo', async () => {
  serve(
    {
      'GET /v1/innovation/my/ideas': () => json({ data: [] }),
      'GET /v1/innovation/ideas': () => json({ data: [IDEA, EVALUATED] }),
      'GET /v1/innovation/ip-assets': () => json({ data: [] }),
    },
    QUALITY,
  );
  show(<InnovationHome />);
  expect(await screen.findByText('Ideas en evaluación')).toBeInTheDocument();
  expect(screen.getByRole('link', { name: /Propiedad intelectual/u })).toBeInTheDocument();
  expect(await screen.findByText('Aún no ha propuesto ideas.')).toBeInTheDocument();
});

it('Calidad inicia la evaluación, diligencia el FT-INN-003 y aprueba', async () => {
  const sent = serve(
    {
      'GET /v1/innovation/ideas': () => json({ data: [IDEA, EVALUATED, OWN_IDEA] }),
      [`POST /v1/innovation/ideas/${IDEA.id}/evaluation`]: () => noContent(),
      [`POST /v1/innovation/ideas/${EVALUATED.id}/viability`]: () => noContent(),
      [`POST /v1/innovation/ideas/${EVALUATED.id}/decision`]: () => noContent(),
    },
    QUALITY,
  );
  show(<InnovationIdeas />);
  await userEvent.click(
    await screen.findByRole('button', { name: 'Iniciar la evaluación de IDE-2026-0001' }),
  );
  await vi.waitFor(() => {
    expect(sentTo(sent, `${IDEA.id}/evaluation`)?.headers['If-Match']).toBe('"1"');
  });
  expect(
    screen.queryByRole('button', { name: 'Iniciar la evaluación de IDE-2026-0003' }),
  ).not.toBeInTheDocument();
  expect(screen.getByText(/Viabilidad: 20 de 25/u)).toBeInTheDocument();
  const viability = await openDialog('Evaluar de nuevo');
  for (const label of [
    'Mercado o necesidad',
    'Viabilidad técnica',
    'Alineación con la estrategia',
    'Costo frente a beneficio',
    'Riesgos (5 = riesgo bajo)',
  ]) {
    await userEvent.selectOptions(within(viability).getByLabelText(label), '4');
  }
  await userEvent.selectOptions(within(viability).getByLabelText('Concepto'), 'viable');
  await userEvent.click(within(viability).getByRole('button', { name: 'Guardar evaluación' }));
  await vi.waitFor(() => {
    expect(sentTo(sent, '/viability')?.body).toMatchObject({
      scores: { market: 4, risk: 4 },
      concept: 'viable',
    });
  });
});

it('el colaborador sin permisos de evaluación no ve los pasos', async () => {
  serve({ 'GET /v1/innovation/ideas': () => json({ data: [IDEA] }) }, ['inn.read']);
  show(<InnovationIdeas />);
  expect(await screen.findByText('IDE-2026-0001')).toBeInTheDocument();
  expect(screen.queryByRole('button', { name: /Iniciar la evaluación/u })).not.toBeInTheDocument();
  expect(screen.queryByRole('button', { name: 'Aprobar o archivar' })).not.toBeInTheDocument();
});

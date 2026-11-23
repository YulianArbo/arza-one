import type { PermissionCode } from '@arza/contracts';
import { screen, within } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

import { json, mockApi, noContent, SESSION, type SentRequest } from '../../test-support/fake-api';
import { permissionsOf } from '../../test-support/party-fixtures';
import { openDialog, sentTo, show } from '../sst/sst-test-support';
import { LegalTextsPanel } from './legal-texts-panel';
import { PagesPanel } from './pages-panel';
import { SubmissionsPanel } from './submissions-panel';
import { WebsiteHome } from './website-home';

// Más casos del módulo «Sitio web» (B41): nueva versión de un texto vigente, publicar lo aprobado,
// editar y retirar una página publicada, y las listas vacías.

vi.mock('next/navigation', () => ({
  usePathname: () => '/app/sitio-web',
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
}));

beforeEach(() => {
  vi.stubGlobal('scrollTo', vi.fn());
});
afterEach(() => vi.unstubAllGlobals());

const ID = (n: number): string => `01900000-0000-7000-8000-${String(n).padStart(12, '0')}`;
const OFFICER: readonly PermissionCode[] = [
  'web.page.manage',
  'web.legal_text.manage',
  'web.legal_text.publish',
  'web.submission.read',
];

function serve(routes: object, codes: readonly PermissionCode[] = OFFICER): SentRequest[] {
  return mockApi({
    'GET /v1/auth/session': () => json(SESSION),
    'GET /v1/me/permissions': () => json(permissionsOf(codes)),
    ...routes,
  });
}

function text(overrides: object) {
  return {
    id: ID(1),
    key: 'site_terms',
    version_number: 1,
    title: 'Términos del sitio',
    body: 'Texto vigente de los términos.',
    status: 'published',
    drafted_by: null,
    approved_by: { id: ID(8), name: 'Dirección de prueba' },
    approved_at: '2026-11-20T15:00:00.000Z',
    concept_file_id: null,
    effective_from: '2026-11-20T15:00:00.000Z',
    version: 3,
    ...overrides,
  };
}

it('una nueva versión parte del texto vigente', async () => {
  const sent = serve({
    'GET /v1/site/legal-texts': () => json({ data: [text({})] }),
    'POST /v1/site/legal-texts': () => json({ id: ID(2) }, 201),
  });
  show(<LegalTextsPanel />);
  const dialog = await openDialog('Nueva versión de Términos y condiciones del sitio');
  expect(within(dialog).getByLabelText('Título')).toHaveValue('Términos del sitio');
  await userEvent.click(within(dialog).getByRole('button', { name: 'Guardar borrador' }));
  expect(await screen.findByText('Los cambios quedaron guardados.')).toBeVisible();
  expect(sentTo(sent, '/v1/site/legal-texts')?.body).toEqual({
    key: 'site_terms',
    title: 'Términos del sitio',
    body: 'Texto vigente de los términos.',
  });
});

it('publica la versión aprobada y edita un borrador', async () => {
  const approved = text({ id: ID(3), version_number: 2, status: 'approved', effective_from: null });
  const draft = text({
    id: ID(4),
    key: 'cookie_policy',
    status: 'draft',
    approved_by: null,
    approved_at: null,
    effective_from: null,
    version: 1,
  });
  const sent = serve({
    'GET /v1/site/legal-texts': () => json({ data: [text({}), approved, draft] }),
    [`POST /v1/site/legal-texts/${ID(3)}/actions/publish`]: () => noContent(),
    [`PATCH /v1/site/legal-texts/${ID(4)}`]: () => noContent(),
  });
  show(<LegalTextsPanel />);
  await userEvent.click(await screen.findByRole('button', { name: 'Publicar' }));
  await userEvent.click(await screen.findByRole('button', { name: 'Sí, publicar' }));
  expect(sentTo(sent, '/actions/publish')?.headers['If-Match']).toBe('"3"');
  const dialog = await openDialog('Editar el borrador de Política de cookies');
  await userEvent.clear(within(dialog).getByLabelText('Texto'));
  await userEvent.click(within(dialog).getByRole('button', { name: 'Guardar borrador' }));
  expect(within(dialog).getAllByText(/al menos 20 caracteres/u).length).toBeGreaterThan(0);
  await userEvent.type(within(dialog).getByLabelText('Texto'), 'Texto nuevo de la política.');
  await userEvent.click(within(dialog).getByRole('button', { name: 'Guardar borrador' }));
  expect(await screen.findByText('Los cambios quedaron guardados.')).toBeVisible();
  expect(sentTo(sent, ID(4))?.body).toMatchObject({ body: 'Texto nuevo de la política.' });
});

it('edita y retira una página publicada', async () => {
  const page = {
    id: ID(5),
    slug: 'nosotros',
    title: 'Nosotros',
    summary: 'Quiénes somos',
    body: 'Somos una empresa ficticia.',
    status: 'published',
    published_at: '2026-11-22T15:00:00.000Z',
    updated_by: { id: ID(9), name: 'Comercial de prueba' },
    version: 2,
  };
  const sent = serve({
    'GET /v1/site/pages': () => json({ data: [page] }),
    [`PATCH /v1/site/pages/${ID(5)}`]: () => noContent(),
    [`POST /v1/site/pages/${ID(5)}/actions`]: () => noContent(),
  });
  show(<PagesPanel />);
  expect(await screen.findByRole('link', { name: '/nosotros' })).toBeVisible();
  const dialog = await openDialog('Editar la página Nosotros');
  expect(within(dialog).getByText(/el cambio se verá en el sitio/u)).toBeVisible();
  await userEvent.click(within(dialog).getByRole('button', { name: 'Guardar borrador' }));
  expect(await screen.findByText('Los cambios quedaron guardados.')).toBeVisible();
  expect(sentTo(sent, ID(5))?.body).toMatchObject({ slug: 'nosotros', summary: 'Quiénes somos' });
  await userEvent.click(screen.getByRole('button', { name: 'Retirar' }));
  await userEvent.click(await screen.findByRole('button', { name: 'Sí, retirar' }));
  expect(sentTo(sent, '/actions')?.body).toEqual({ action: 'withdraw' });
});

it('las listas vacías lo dicen y sin permisos no hay secciones', async () => {
  serve({
    'GET /v1/site/pages': () => json({ data: [] }),
    'GET /v1/site/submissions': () => json({ data: [] }),
    'GET /v1/site/unsubscribes': () =>
      json({
        data: [
          {
            id: ID(6),
            email: 'baja@ejemplo.test',
            source: 'ack_link',
            unsubscribed_at: '2026-11-22T15:00:00.000Z',
          },
        ],
      }),
  });
  show(
    <>
      <PagesPanel />
      <SubmissionsPanel />
    </>,
  );
  expect(await screen.findByText('Todavía no hay páginas')).toBeVisible();
  expect(await screen.findByText('Todavía no llegan formularios')).toBeVisible();
  expect(await screen.findByText(/baja@ejemplo.test/u)).toBeVisible();
});

it('sin permisos del sitio, la portada no muestra secciones', async () => {
  serve({}, []);
  show(<WebsiteHome />);
  expect(await screen.findByText('No tiene acceso a esta sección')).toBeVisible();
});

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

// Módulo «Sitio web» (B41): páginas, textos legales con aprobación por otra persona y formularios
// recibidos. La API es la barrera; la pantalla solo ofrece lo que el permiso permite.

vi.mock('next/navigation', () => ({
  usePathname: () => '/app/sitio-web',
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
}));

beforeEach(() => {
  vi.stubGlobal('scrollTo', vi.fn());
});
afterEach(() => vi.unstubAllGlobals());

const ID = (n: number): string => `01900000-0000-7000-8000-${String(n).padStart(12, '0')}`;
const SALES: readonly PermissionCode[] = [
  'web.page.manage',
  'web.legal_text.manage',
  'web.submission.read',
];
const OFFICER: readonly PermissionCode[] = [...SALES, 'web.legal_text.publish'];

function serve(routes: object, codes: readonly PermissionCode[]): SentRequest[] {
  return mockApi({
    'GET /v1/auth/session': () => json(SESSION),
    'GET /v1/me/permissions': () => json(permissionsOf(codes)),
    ...routes,
  });
}

const DRAFT = {
  id: ID(1),
  key: 'cookie_policy',
  version_number: 2,
  title: 'Política de cookies',
  body: 'Texto en borrador de la política.',
  status: 'draft',
  drafted_by: { id: ID(9), name: 'Comercial de prueba' },
  approved_by: null,
  approved_at: null,
  concept_file_id: null,
  effective_from: null,
  version: 1,
};

it('la portada muestra solo las secciones permitidas', async () => {
  serve({}, ['web.submission.read']);
  show(<WebsiteHome />);
  expect(await screen.findByText('Formularios recibidos')).toBeVisible();
  expect(screen.queryByText('Textos legales')).toBeNull();
});

it('crea una página en borrador y la publica', async () => {
  const page = {
    id: ID(2),
    slug: 'nosotros',
    title: 'Nosotros',
    summary: null,
    body: 'Somos una empresa ficticia.',
    status: 'draft',
    published_at: null,
    updated_by: null,
    version: 1,
  };
  const sent = serve(
    {
      'GET /v1/site/pages': () => json({ data: [page] }),
      'POST /v1/site/pages': () => json({ id: ID(3) }, 201),
      [`POST /v1/site/pages/${page.id}/actions`]: () => noContent(),
    },
    SALES,
  );
  show(<PagesPanel />);
  const dialog = await openDialog('Nueva página');
  await userEvent.type(within(dialog).getByLabelText(/Dirección/u), 'Con Espacios');
  await userEvent.type(within(dialog).getByLabelText('Título'), 'Servicios');
  await userEvent.type(within(dialog).getByLabelText('Texto'), 'Texto de la nueva página.');
  await userEvent.click(within(dialog).getByRole('button', { name: 'Guardar borrador' }));
  expect(within(dialog).getAllByText(/minúsculas, números y guiones/u).length).toBeGreaterThan(0);
  await userEvent.clear(within(dialog).getByLabelText(/Dirección/u));
  await userEvent.type(within(dialog).getByLabelText(/Dirección/u), 'servicios');
  await userEvent.click(within(dialog).getByRole('button', { name: 'Guardar borrador' }));
  expect(await screen.findByText('Los cambios quedaron guardados.')).toBeVisible();
  expect(sentTo(sent, '/v1/site/pages')?.body).toMatchObject({ slug: 'servicios', summary: null });
  await userEvent.click(screen.getByRole('button', { name: 'Publicar' }));
  await userEvent.click(await screen.findByRole('button', { name: 'Sí, publicar' }));
  expect(sentTo(sent, '/actions')?.body).toEqual({ action: 'publish' });
});

it('solo quien puede publicar ve «Aprobar»; quien redacta solo edita el borrador', async () => {
  serve({ 'GET /v1/site/legal-texts': () => json({ data: [DRAFT] }) }, SALES);
  show(<LegalTextsPanel />);
  expect(
    await screen.findByRole('button', { name: /Editar el borrador de Política/u }),
  ).toBeVisible();
  expect(screen.queryByRole('button', { name: 'Aprobar' })).toBeNull();
});

it('quien puede publicar aprueba el borrador con confirmación', async () => {
  const sent = serve(
    {
      'GET /v1/site/legal-texts': () => json({ data: [DRAFT] }),
      [`POST /v1/site/legal-texts/${DRAFT.id}/actions/approve`]: () => noContent(),
    },
    OFFICER,
  );
  show(<LegalTextsPanel />);
  await userEvent.click(await screen.findByRole('button', { name: 'Aprobar' }));
  await userEvent.click(await screen.findByRole('button', { name: 'Sí, aprobar' }));
  const approve = sentTo(sent, '/actions/approve');
  expect(approve?.body).toEqual({ concept_file_id: null });
  expect(approve?.headers['If-Match']).toBe('"1"');
  expect(screen.getAllByText(/Sin versión publicada/u).length).toBeGreaterThan(0);
});

it('lista los formularios recibidos con su prospecto y las bajas', async () => {
  serve(
    {
      'GET /v1/site/submissions': () =>
        json({
          data: [
            {
              id: ID(5),
              code: 'FRM-2026-0001',
              form_key: 'quote',
              name: 'Ana Pérez',
              email: 'ana@ejemplo.test',
              phone: null,
              company: null,
              detail: 'Migrar a la nube.',
              service: 'cloud',
              timeframe: 'now',
              received_at: '2026-11-22T15:00:00.000Z',
              notice_version: 3,
              lead: { id: ID(6), code: 'LEA-2026-0004' },
              ack_sent_at: null,
            },
          ],
        }),
      'GET /v1/site/unsubscribes': () => json({ data: [] }),
    },
    SALES,
  );
  show(<SubmissionsPanel />);
  expect(await screen.findByText('FRM-2026-0001')).toBeVisible();
  expect(screen.getByText(/Infraestructura cloud · Lo antes posible/u)).toBeVisible();
  expect(screen.getByRole('link', { name: 'Ver el prospecto LEA-2026-0004' })).toBeVisible();
  expect(await screen.findByText('Nadie se ha dado de baja')).toBeVisible();
});

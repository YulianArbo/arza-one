import { screen } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

import { apiError, json, mockApi, renderWithApi } from '../../test-support/fake-api';
import { forgetLinkToken } from '../access/link-token';
import { LegalTextView, PublicPageView, SitePageLinks } from './public-content';
import { UnsubscribeView } from './unsubscribe-view';

// Páginas institucionales, la política de tratamiento de Privacidad y los enlaces de baja (B41):
// lo publicado, lo que no existe y lo que falla. Datos ficticios.

beforeEach(() => {
  vi.stubGlobal('scrollTo', vi.fn());
});

afterEach(() => {
  vi.unstubAllGlobals();
  forgetLinkToken();
  window.history.replaceState(null, '', '/');
});

const PAGE = {
  slug: 'nosotros',
  title: 'Nosotros',
  summary: null,
  body: 'Somos una empresa ficticia.\n\n## Cómo trabajamos\n\n- Con orden.',
  published_at: '2026-11-22T15:00:00.000Z',
};

it('muestra la página publicada y los enlaces del pie', async () => {
  mockApi({
    'GET /v1/public/pages/nosotros': () => json(PAGE),
    'GET /v1/public/pages': () => json({ data: [{ slug: 'nosotros', title: 'Nosotros' }] }),
  });
  renderWithApi(
    <>
      <PublicPageView slug="nosotros" />
      <SitePageLinks />
    </>,
  );
  expect(await screen.findByRole('heading', { name: 'Cómo trabajamos' })).toBeVisible();
  expect(screen.getByText('Actualizada el 22/11/2026')).toBeVisible();
  expect(await screen.findByRole('link', { name: 'Nosotros' })).toHaveAttribute(
    'href',
    '/nosotros',
  );
});

it('una página que no existe lo dice; si la API falla, muestra el error', async () => {
  mockApi({
    'GET /v1/public/pages/otra': () => apiError(404, 'SITE_RECORD_NOT_FOUND', 'No existe.'),
    'GET /v1/public/pages/rota': () => apiError(500, 'INTERNAL_ERROR', 'Error inesperado.'),
  });
  const first = renderWithApi(<PublicPageView slug="otra" />);
  expect(await screen.findByText('Esta página no existe')).toBeVisible();
  first.unmount();
  renderWithApi(<PublicPageView slug="rota" />);
  expect(await screen.findByText(/Error inesperado/u)).toBeVisible();
});

it('la política de tratamiento se lee de Privacidad', async () => {
  mockApi({
    'GET /v1/public/legal/privacy-policy': () =>
      json({
        id: '01900000-0000-7000-8000-000000000050',
        title: 'Política de tratamiento',
        body: 'Texto de la política.',
        version_number: 4,
        effective_from: '2026-11-20T15:00:00.000Z',
      }),
  });
  renderWithApi(<LegalTextView slug="privacidad" title="Política de tratamiento de datos" />);
  expect(await screen.findByText(/Versión 4 · Vigente desde el 20\/11\/2026/u)).toBeVisible();
});

it('el enlace de baja incompleto lo dice, y uno ya usado avisa que ya estaba', async () => {
  const first = renderWithApi(<UnsubscribeView />);
  expect(await screen.findByText(/no está completo/u)).toBeVisible();
  first.unmount();
  forgetLinkToken();
  window.history.replaceState(null, '', `/baja#token=${'D'.repeat(43)}`);
  mockApi({
    'POST /v1/public/unsubscribe': () => json({ email: 'a•••@ejemplo.test', already: true }),
  });
  renderWithApi(<UnsubscribeView />);
  expect(await screen.findByText(/ya estaba dado de baja/u)).toBeVisible();
});

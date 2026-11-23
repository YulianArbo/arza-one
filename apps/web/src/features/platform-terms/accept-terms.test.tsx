import { screen } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

import { json, mockApi, noContent, renderWithApi, SESSION } from '../../test-support/fake-api';
import { AcceptTerms } from './accept-terms';

// Aceptar los términos de la plataforma en el siguiente ingreso (B41, decisión 3).

const navigation = vi.hoisted(() => ({
  replace: vi.fn(),
  search: new URLSearchParams('volver=/app/comercial'),
}));

vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace: navigation.replace }),
  useSearchParams: () => navigation.search,
}));

beforeEach(() => {
  navigation.replace.mockReset();
});
afterEach(() => vi.unstubAllGlobals());

const TERMS = {
  id: '01900000-0000-7000-8000-000000000077',
  key: 'platform_terms',
  title: 'Términos de uso de la plataforma',
  body: '## Su cuenta\n\nCuide su contraseña.',
  version_number: 2,
  effective_from: '2026-11-22T15:00:00.000Z',
};

it('pide marcar la casilla, registra la versión leída y vuelve a donde iba', async () => {
  const sent = mockApi({
    'GET /v1/auth/session': () => json({ ...SESSION, terms_pending: true }),
    'GET /v1/me/platform-terms': () => json({ pending: true, terms: TERMS }),
    'POST /v1/me/platform-terms/accept': () => noContent(),
  });
  renderWithApi(<AcceptTerms />);
  expect(await screen.findByRole('heading', { name: 'Su cuenta' })).toBeVisible();
  expect(screen.getByText(/Versión 2, vigente desde el 22\/11\/2026/u)).toBeVisible();
  await userEvent.click(screen.getByRole('button', { name: 'Aceptar y continuar' }));
  expect(screen.getByText('Para continuar, marque la casilla.')).toBeVisible();
  await userEvent.click(screen.getByRole('checkbox'));
  await userEvent.click(screen.getByRole('button', { name: 'Aceptar y continuar' }));
  await vi.waitFor(() => {
    expect(navigation.replace).toHaveBeenCalledWith('/app/comercial');
  });
  const accept = sent.find((request) => request.method === 'POST');
  expect(accept?.body).toEqual({ text_id: TERMS.id });
  expect(accept?.headers['X-CSRF-Token']).toBe(SESSION.csrf_token);
});

it('si no hay nada pendiente, sigue de largo', async () => {
  mockApi({
    'GET /v1/auth/session': () => json(SESSION),
    'GET /v1/me/platform-terms': () => json({ pending: false, terms: null }),
  });
  renderWithApi(<AcceptTerms />);
  await vi.waitFor(() => {
    expect(navigation.replace).toHaveBeenCalledWith('/app/comercial');
  });
});

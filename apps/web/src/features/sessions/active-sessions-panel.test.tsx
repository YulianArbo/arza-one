import { screen, within } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import type { JSX } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { SESSION, json, mockApi, noContent, renderWithApi } from '../../test-support/fake-api';
import { RequireSession } from '../session/session-provider';
import { ActiveSessionsPanel } from './active-sessions-panel';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace: vi.fn() }),
  usePathname: () => '/app/perfil/sesiones',
}));

const CURRENT = {
  id: '01999a00-0000-7000-8000-00000000b001',
  created_at: '2026-10-09T13:00:00.000Z',
  last_seen_at: '2026-10-09T20:10:00.000Z',
  ip: '10.0.0.1',
  browser: 'Chrome',
  os: 'Windows',
  current: true,
  pending_second_factor: false,
};
const PHONE = {
  ...CURRENT,
  id: '01999a00-0000-7000-8000-00000000b002',
  ip: '10.0.0.2',
  os: 'Android',
  current: false,
};

function Screen(): JSX.Element {
  return (
    <RequireSession kind="internal">
      <ActiveSessionsPanel />
    </RequireSession>
  );
}

beforeEach(() => {
  vi.stubGlobal('scrollTo', vi.fn());
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('sesiones activas', () => {
  it('muestra cada equipo, cuándo entró en hora de Colombia y cuál es esta sesión', async () => {
    mockApi({
      'GET /v1/auth/session': () => json(SESSION),
      'GET /v1/me/sessions': () => json({ data: [CURRENT, PHONE] }),
    });
    renderWithApi(<Screen />);
    const list = await screen.findByRole('list', { name: 'Sesiones abiertas' });
    const rows = within(list).getAllByRole('listitem');
    expect(rows).toHaveLength(2);
    expect(rows[0]).toHaveTextContent('Chrome en Windows');
    expect(rows[0]).toHaveTextContent('Esta sesión');
    expect(rows[0]).toHaveTextContent('09/10/2026, 8:00 a. m.');
    // Solo la otra sesión ofrece cerrarse: la actual se cierra con «Cerrar sesión» del menú.
    expect(within(list).getAllByRole('button', { name: 'Cerrar sesión' })).toHaveLength(1);
    expect(rows[1]).toHaveTextContent('Chrome en Android');
  });
});

describe('cerrar sesiones', () => {
  it('cierra otra sesión después de confirmar, con el código antifalsificación', async () => {
    const sent = mockApi({
      'GET /v1/auth/session': () => json(SESSION),
      'GET /v1/me/sessions': () => json({ data: [CURRENT, PHONE] }),
      [`POST /v1/me/sessions/${PHONE.id}/revoke`]: () => noContent(),
    });
    renderWithApi(<Screen />);
    const user = userEvent.setup({ delay: null });
    await user.click(await screen.findByRole('button', { name: 'Cerrar sesión' }));
    const dialog = await screen.findByRole('alertdialog');
    expect(dialog).toHaveTextContent('¿Cerrar la sesión de Chrome en Android?');
    await user.click(within(dialog).getByRole('button', { name: 'Sí, cerrar' }));
    expect(await screen.findByText(/Cerramos la sesión de Chrome en Android/)).toBeVisible();
    const revoke = sent.find((request) => request.path.endsWith('/revoke'));
    expect(revoke?.headers['X-CSRF-Token']).toBe('codigo-de-prueba');
  });

  it('cierra todas las demás', async () => {
    const sent = mockApi({
      'GET /v1/auth/session': () => json(SESSION),
      'GET /v1/me/sessions': () => json({ data: [CURRENT, PHONE] }),
      'POST /v1/me/sessions/revoke-others': () => json({ closed: 1 }),
    });
    renderWithApi(<Screen />);
    const user = userEvent.setup({ delay: null });
    await user.click(await screen.findByRole('button', { name: 'Cerrar todas las demás' }));
    await user.click(
      within(await screen.findByRole('alertdialog')).getByRole('button', { name: 'Sí, cerrar' }),
    );
    expect(await screen.findByText('Cerramos 1 sesión.')).toBeVisible();
    expect(sent.some((request) => request.path === '/v1/me/sessions/revoke-others')).toBe(true);
  });
});

describe('con una sola sesión', () => {
  it('lo dice y no ofrece cerrar otras', async () => {
    mockApi({
      'GET /v1/auth/session': () => json(SESSION),
      'GET /v1/me/sessions': () => json({ data: [CURRENT] }),
    });
    renderWithApi(<Screen />);
    expect(await screen.findByText('Solo tiene abierta esta sesión.')).toBeVisible();
    expect(screen.queryByRole('button', { name: /Cerrar/ })).toBeNull();
  });
});

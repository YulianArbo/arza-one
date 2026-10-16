import { screen, waitFor } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import type { JSX, ReactNode } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  SESSION,
  apiError,
  json,
  mockApi,
  noContent,
  renderWithApi,
} from '../../test-support/fake-api';
import { NOTICE_ID, PREFERENCES, notice, permissions } from '../../test-support/ntf-fixtures';
import { RequireSession } from '../session/session-provider';
import { badgeCount, unreadLabel } from './labels';
import { NotificationCenter } from './notification-center';
import { NotificationPreferencesPanel } from './notification-preferences';
import { NotificationsMenu } from './notifications-menu';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace: vi.fn(), push: vi.fn() }),
  usePathname: () => '/app/avisos',
}));

function Screen({ children }: { readonly children: ReactNode }): JSX.Element {
  return <RequireSession kind="internal">{children}</RequireSession>;
}

function serve(routes: Parameters<typeof mockApi>[0] = {}) {
  return mockApi({
    'GET /v1/auth/session': () => json(SESSION),
    'GET /v1/me/permissions': () => json(permissions([])),
    'GET /v1/me/notifications': () => json({ items: [notice()], unread_count: 1 }),
    [`POST /v1/me/notifications/${NOTICE_ID}/read`]: () => noContent(),
    'POST /v1/me/notifications/read-all': () => noContent(),
    'GET /v1/me/notification-preferences': () => json(PREFERENCES),
    'PUT /v1/me/notification-preferences': () => json(PREFERENCES),
    ...routes,
  });
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('textos de la campanita', () => {
  it('dice cuántos avisos hay sin leer, también al lector de pantalla', () => {
    expect(unreadLabel(0)).toBe('Avisos: no tiene avisos sin leer');
    expect(unreadLabel(1)).toBe('Avisos: 1 sin leer');
    expect(unreadLabel(4)).toBe('Avisos: 4 sin leer');
    expect([badgeCount(3), badgeCount(12)]).toEqual(['3', '9+']);
  });
});

describe('campanita de avisos', () => {
  it('muestra los avisos sin leer y marca como leído el que se abre', async () => {
    const sent = serve();
    renderWithApi(
      <Screen>
        <NotificationsMenu />
      </Screen>,
    );
    const bell = await screen.findByRole('button', { name: 'Avisos: 1 sin leer' });
    await userEvent.click(bell);
    const item = await screen.findByRole('menuitem', { name: /Revisar la cotización/ });
    expect(item).toHaveAttribute('href', notice().link);
    await userEvent.click(item);
    await waitFor(() => {
      expect(
        sent.some((request) => request.path === `/v1/me/notifications/${NOTICE_ID}/read`),
      ).toBe(true);
    });
    expect(sent.find((request) => request.path === '/v1/me/notifications')?.search).toContain(
      'unread=true',
    );
  });

  it('sin avisos nuevos lo dice', async () => {
    serve({ 'GET /v1/me/notifications': () => json({ items: [], unread_count: 0 }) });
    renderWithApi(
      <Screen>
        <NotificationsMenu />
      </Screen>,
    );
    await userEvent.click(
      await screen.findByRole('button', { name: 'Avisos: no tiene avisos sin leer' }),
    );
    expect(await screen.findByText('No tiene avisos nuevos.')).toBeInTheDocument();
  });
});

describe('centro de avisos', () => {
  it('lista los avisos, filtra los no leídos y los marca todos como leídos', async () => {
    const sent = serve();
    renderWithApi(
      <Screen>
        <NotificationCenter />
      </Screen>,
    );
    expect(await screen.findByRole('link', { name: notice().title })).toBeVisible();
    expect(screen.getByText('Nuevo')).toBeVisible();
    await userEvent.click(screen.getByRole('button', { name: 'Sin leer (1)' }));
    await waitFor(() => {
      expect(sent.some((request) => request.search.includes('unread=true'))).toBe(true);
    });
    await userEvent.click(screen.getByRole('button', { name: 'Marcar todos como leídos' }));
    await waitFor(() => {
      expect(sent.some((request) => request.path === '/v1/me/notifications/read-all')).toBe(true);
    });
  });

  it('marca uno como leído y muestra el estado vacío', async () => {
    const sent = serve();
    renderWithApi(
      <Screen>
        <NotificationCenter />
      </Screen>,
    );
    await userEvent.click(await screen.findByRole('button', { name: 'Marcar como leído' }));
    await waitFor(() => {
      expect(sent.some((request) => request.path.endsWith('/read'))).toBe(true);
    });
  });
});

describe('centro de avisos: estados', () => {
  it('sin avisos explica cuándo llegan', async () => {
    serve({ 'GET /v1/me/notifications': () => json({ items: [], unread_count: 0 }) });
    renderWithApi(
      <Screen>
        <NotificationCenter />
      </Screen>,
    );
    expect(await screen.findByText('Todavía no tiene avisos')).toBeVisible();
  });

  it('si la API falla muestra el error con su código de soporte', async () => {
    serve({ 'GET /v1/me/notifications': () => apiError(500, 'INTERNAL_ERROR', 'Falla') });
    renderWithApi(
      <Screen>
        <NotificationCenter />
      </Screen>,
    );
    expect(await screen.findByText(/corr-1234/)).toBeInTheDocument();
  });
});

describe('preferencias de aviso', () => {
  it('la alerta urgente no se puede apagar y las demás se guardan', async () => {
    const sent = serve();
    renderWithApi(
      <Screen>
        <NotificationPreferencesPanel />
      </Screen>,
    );
    const assigned = await screen.findByRole('checkbox', { name: 'Le asignaron una tarea' });
    expect(screen.queryByRole('checkbox', { name: 'Alerta de seguridad' })).not.toBeInTheDocument();
    expect(screen.getByText(/Es urgente: llega siempre por correo/)).toBeVisible();
    await userEvent.click(assigned);
    await userEvent.click(screen.getByRole('button', { name: 'Guardar preferencias' }));
    expect(await screen.findByText('Preferencias guardadas.')).toBeVisible();
    const put = sent.find((request) => request.method === 'PUT');
    expect(JSON.stringify(put?.body)).toContain('{"kind":"task_assigned","email":false}');
  });
});

import { screen } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import type { JSX } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  SESSION,
  apiError,
  json,
  mockApi,
  noContent,
  renderWithApi,
} from '../../test-support/fake-api';
import { RequireSession, useSession } from './session-provider';

const navigation = vi.hoisted(() => ({ replace: vi.fn() }));

vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace: navigation.replace }),
  usePathname: () => '/app/estado-del-sistema',
}));

const UNAUTHENTICATED = () =>
  apiError(401, 'UNAUTHENTICATED', 'Debe iniciar sesión para continuar.');

function Content(): JSX.Element {
  const { session, logout } = useSession();
  return (
    <button type="button" onClick={() => void logout()}>
      Salir de {session.user.display_name}
    </button>
  );
}

function renderGuarded(kind: 'internal' | 'portal' = 'internal'): void {
  renderWithApi(
    <RequireSession kind={kind}>
      <Content />
    </RequireSession>,
  );
}

beforeEach(() => {
  navigation.replace.mockReset();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('pantallas que exigen sesión', () => {
  it('mientras verifica no muestra el contenido; con sesión lo muestra', async () => {
    mockApi({ 'GET /v1/auth/session': () => json(SESSION) });
    renderGuarded();
    expect(screen.getByRole('status')).toHaveTextContent('Verificando su sesión');
    expect(await screen.findByRole('button', { name: 'Salir de Ana Pérez' })).toBeVisible();
  });

  it('sin sesión lleva a iniciar sesión y recuerda a dónde volver', async () => {
    mockApi({ 'GET /v1/auth/session': UNAUTHENTICATED });
    renderGuarded();
    await vi.waitFor(() => {
      expect(navigation.replace).toHaveBeenCalledWith(
        '/iniciar-sesion?volver=%2Fapp%2Festado-del-sistema',
      );
    });
    expect(screen.queryByRole('button')).toBeNull();
  });
});

describe('pantallas que exigen sesión: etapas y superficies', () => {
  it('a una sesión que le falta el segundo factor la lleva a ese paso (B09)', async () => {
    mockApi({ 'GET /v1/auth/session': () => json({ ...SESSION, stage: 'second_factor' }) });
    renderGuarded();
    await vi.waitFor(() => {
      expect(navigation.replace).toHaveBeenCalledWith(
        '/segundo-factor?volver=%2Fapp%2Festado-del-sistema',
      );
    });
    expect(screen.queryByRole('button', { name: /Salir/ })).toBeNull();
  });

  it('una persona de la aplicación interna que entra al portal va a su aplicación', async () => {
    mockApi({ 'GET /v1/auth/session': () => json(SESSION) });
    renderGuarded('portal');
    await vi.waitFor(() => {
      expect(navigation.replace).toHaveBeenCalledWith('/app');
    });
    expect(screen.queryByRole('button', { name: /Salir/ })).toBeNull();
  });

  it('si la API falla, explica el problema y permite reintentar', async () => {
    mockApi({});
    renderGuarded();
    expect(await screen.findByRole('alert', {}, { timeout: 5000 })).toHaveTextContent(
      'No pudimos comunicarnos',
    );
    expect(screen.getByRole('button', { name: /Reintentar|Intentar de nuevo/ })).toBeVisible();
  });
});

describe('cerrar sesión', () => {
  it('envía el código antifalsificación y lleva a iniciar sesión', async () => {
    const sent = mockApi({
      'GET /v1/auth/session': () => json(SESSION),
      'POST /v1/auth/logout': noContent,
    });
    renderGuarded();
    await userEvent
      .setup({ delay: null })
      .click(await screen.findByRole('button', { name: /Salir/ }));
    await vi.waitFor(() => {
      expect(navigation.replace).toHaveBeenCalledWith('/iniciar-sesion?motivo=sesion-cerrada');
    });
    const logout = sent.find((request) => request.path === '/v1/auth/logout');
    expect(logout?.headers['X-CSRF-Token']).toBe(SESSION.csrf_token);
  });

  it('si la sesión ya había vencido, el resultado es el mismo', async () => {
    mockApi({
      'GET /v1/auth/session': () => json(SESSION),
      'POST /v1/auth/logout': UNAUTHENTICATED,
    });
    renderGuarded();
    await userEvent
      .setup({ delay: null })
      .click(await screen.findByRole('button', { name: /Salir/ }));
    await vi.waitFor(() => {
      expect(navigation.replace).toHaveBeenCalledWith('/iniciar-sesion?motivo=sesion-cerrada');
    });
  });
});

import { screen } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  SESSION,
  apiError,
  json,
  mockApi,
  noContent,
  renderWithApi,
} from '../../test-support/fake-api';
import { RequireSession } from '../session/session-provider';
import { ProfilePanel } from './profile-panel';

const navigation = vi.hoisted(() => ({ replace: vi.fn() }));

vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace: navigation.replace }),
  usePathname: () => '/app/perfil',
}));

const ME = {
  ...SESSION.user,
  last_login_at: '2026-10-09T20:15:00.000Z',
  password_changed_at: null,
  has_photo: false,
};

const NEW_PASSWORD = 'arepa de choclo con queso';

function renderProfile(): void {
  renderWithApi(
    <RequireSession kind="internal">
      <ProfilePanel />
    </RequireSession>,
  );
}

async function changePassword(current: string): Promise<void> {
  const user = userEvent.setup({ delay: null });
  await user.type(await screen.findByLabelText('Contraseña actual'), current);
  await user.type(screen.getByLabelText('Contraseña nueva'), NEW_PASSWORD);
  await user.type(screen.getByLabelText('Repita la contraseña'), NEW_PASSWORD);
  await user.click(screen.getByRole('button', { name: 'Cambiar contraseña' }));
}

beforeEach(() => {
  navigation.replace.mockReset();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('mi perfil', () => {
  it('muestra los datos con fechas en formato colombiano', async () => {
    mockApi({ 'GET /v1/auth/session': () => json(SESSION), 'GET /v1/me': () => json(ME) });
    renderProfile();
    expect(await screen.findByText('ana@demo-uno.test')).toBeVisible();
    expect(screen.getByText(/^09\/10\/2026,? 3:15/)).toBeVisible();
    expect(screen.getByText('—')).toBeVisible();
  });

  it('si no carga, lo explica con el código para soporte', async () => {
    mockApi({
      'GET /v1/auth/session': () => json(SESSION),
      'GET /v1/me': () => apiError(500, 'INTERNAL_ERROR', 'Ocurrió un error inesperado.'),
    });
    renderProfile();
    expect(
      await screen.findByText('Ocurrió un error inesperado.', {}, { timeout: 5000 }),
    ).toBeVisible();
    expect(screen.getByText(/corr-1234/)).toBeVisible();
  });
});

describe('cambiar la contraseña', () => {
  it('envía el código antifalsificación y, como se cierran las sesiones, pide entrar de nuevo', async () => {
    const sent = mockApi({
      'GET /v1/auth/session': () => json(SESSION),
      'GET /v1/me': () => json(ME),
      'POST /v1/me/password': noContent,
    });
    renderProfile();
    await changePassword('mango biche con sal y limon');
    await vi.waitFor(() => {
      expect(navigation.replace).toHaveBeenCalledWith('/iniciar-sesion?motivo=contrasena-cambiada');
    });
    const change = sent.find((request) => request.path === '/v1/me/password');
    expect(change?.headers['X-CSRF-Token']).toBe(SESSION.csrf_token);
    expect(change?.body).toEqual({
      current_password: 'mango biche con sal y limon',
      new_password: NEW_PASSWORD,
    });
  });
});

describe('cambiar la contraseña: errores', () => {
  it('si la contraseña actual no es correcta, lo dice y no sale de la pantalla', async () => {
    const message = 'La contraseña actual no es correcta.';
    mockApi({
      'GET /v1/auth/session': () => json(SESSION),
      'GET /v1/me': () => json(ME),
      'POST /v1/me/password': () => apiError(422, 'CURRENT_PASSWORD_INCORRECT', message),
    });
    renderProfile();
    await changePassword('no es la actual');
    expect(await screen.findByText(message)).toBeVisible();
    expect(navigation.replace).not.toHaveBeenCalled();
  });

  it('si la sesión venció, pide iniciar sesión de nuevo', async () => {
    mockApi({
      'GET /v1/auth/session': () => json(SESSION),
      'GET /v1/me': () => json(ME),
      'POST /v1/me/password': () => apiError(401, 'UNAUTHENTICATED', 'Debe iniciar sesión.'),
    });
    renderProfile();
    await changePassword('mango biche con sal y limon');
    await vi.waitFor(() => {
      expect(navigation.replace).toHaveBeenCalledWith('/iniciar-sesion?motivo=sesion-vencida');
    });
  });

  it('pide la contraseña actual antes de enviar', async () => {
    const sent = mockApi({
      'GET /v1/auth/session': () => json(SESSION),
      'GET /v1/me': () => json(ME),
    });
    renderProfile();
    await userEvent
      .setup()
      .click(await screen.findByRole('button', { name: 'Cambiar contraseña' }));
    expect(screen.getByText('Escriba su contraseña actual.')).toBeVisible();
    expect(sent.some((request) => request.method === 'POST')).toBe(false);
  });
});

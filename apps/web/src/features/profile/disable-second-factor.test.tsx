import { screen, within } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import type { JSX } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  SESSION,
  apiError,
  json,
  mockApi,
  noContent,
  renderWithApi,
} from '../../test-support/fake-api';
import { RequireSession } from '../session/session-provider';
import { DisableSecondFactor } from './disable-second-factor';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace: vi.fn() }),
  usePathname: () => '/app/perfil',
}));

const OPTIONAL = {
  required: false,
  enabled: true,
  confirmed_at: null,
  recovery_codes_remaining: 9,
};

function Screen(): JSX.Element {
  return (
    <RequireSession kind="portal">
      <DisableSecondFactor />
    </RequireSession>
  );
}

const PORTAL = { ...SESSION, user: { ...SESSION.user, kind: 'portal' } };

afterEach(() => {
  vi.unstubAllGlobals();
});

async function confirmDisable(): Promise<ReturnType<typeof userEvent.setup>> {
  const user = userEvent.setup({ delay: null });
  await user.click(await screen.findByRole('button', { name: 'Desactivar' }));
  const dialog = await screen.findByRole('alertdialog');
  expect(dialog).toHaveTextContent('se cerrarán sus demás sesiones');
  await user.click(within(dialog).getByRole('button', { name: 'Sí, desactivar' }));
  return user;
}

describe('desactivar el segundo factor', () => {
  it('después de confirmar, lo desactiva con el código antifalsificación', async () => {
    const sent = mockApi({
      'GET /v1/auth/session': () => json(PORTAL),
      'POST /v1/me/mfa/disable': () => noContent(),
    });
    renderWithApi(<Screen />);
    await confirmDisable();
    await vi.waitFor(() => {
      expect(sent.some((request) => request.path === '/v1/me/mfa/disable')).toBe(true);
    });
  });

  it('si la API pide confirmar la identidad, lo hace y lo repite', async () => {
    let attempts = 0;
    mockApi({
      'GET /v1/auth/session': () => json(PORTAL),
      'GET /v1/me/mfa': () => json(OPTIONAL),
      'POST /v1/me/mfa/disable': () => {
        attempts += 1;
        return attempts === 1
          ? apiError(403, 'REAUTHENTICATION_REQUIRED', 'Confirme que es usted.')
          : noContent();
      },
      'POST /v1/auth/reauthenticate': () => noContent(),
    });
    renderWithApi(<Screen />);
    const user = await confirmDisable();
    await screen.findByRole('dialog', { name: 'Confirme que es usted' });
    await user.type(screen.getByLabelText('Contraseña'), 'una frase propia');
    await user.type(screen.getByLabelText('Código de seis dígitos'), '123456');
    await user.click(screen.getByRole('button', { name: 'Confirmar' }));
    await vi.waitFor(() => {
      expect(attempts).toBe(2);
    });
  });
});

describe('desactivar el segundo factor: errores', () => {
  it('muestra el mensaje de la API', async () => {
    const message = 'Su tipo de usuario exige segundo factor.';
    mockApi({
      'GET /v1/auth/session': () => json(PORTAL),
      'POST /v1/me/mfa/disable': () => apiError(422, 'SECOND_FACTOR_MANDATORY', message),
    });
    renderWithApi(<Screen />);
    await confirmDisable();
    expect(await screen.findByRole('alert')).toHaveTextContent(message);
  });
});

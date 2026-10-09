import { screen } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { useRef, useState, type JSX } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  SESSION,
  apiError,
  json,
  mockApi,
  noContent,
  renderWithApi,
} from '../../test-support/fake-api';
import { ApiError } from '../../lib/api/api-error';
import { needsReauthentication, useReauthentication } from './reauthentication';

const navigation = vi.hoisted(() => ({ replace: vi.fn() }));

vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace: navigation.replace }),
}));

/** Pantalla mínima: una acción que la API rechaza la primera vez pidiendo confirmación. */
function ActionThatNeedsReauth(): JSX.Element {
  const reauth = useReauthentication(SESSION);
  const runs = useRef(0);
  const [count, setCount] = useState(0);
  const run = (): void => {
    runs.current += 1;
    setCount(runs.current);
    if (runs.current === 1) reauth.handle(REAUTH_REQUIRED, run);
  };
  return (
    <>
      <button type="button" onClick={run}>
        Acción delicada ({count})
      </button>
      {reauth.dialog}
    </>
  );
}

const REAUTH_REQUIRED = new ApiError('REAUTHENTICATION_REQUIRED', 'Confirme que es usted.', 403);

const WITHOUT_FACTOR = {
  required: false,
  enabled: false,
  confirmed_at: null,
  recovery_codes_remaining: 0,
};

beforeEach(() => {
  navigation.replace.mockReset();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('confirme que es usted', () => {
  it('solo atiende el error de confirmación: los demás errores siguen su curso', () => {
    expect(needsReauthentication(REAUTH_REQUIRED)).toBe(true);
    expect(needsReauthentication(new ApiError('CSRF_INVALID', 'No', 403))).toBe(false);
    expect(needsReauthentication(new Error('otro'))).toBe(false);
  });

  it('sin segundo factor pide solo la contraseña', async () => {
    const sent = mockApi({
      'GET /v1/me/mfa': () => json(WITHOUT_FACTOR),
      'POST /v1/auth/reauthenticate': () => noContent(),
    });
    renderWithApi(<ActionThatNeedsReauth />);
    const user = userEvent.setup({ delay: null });
    await user.click(screen.getByRole('button', { name: /Acción delicada/ }));
    await screen.findByRole('dialog', { name: 'Confirme que es usted' });
    await vi.waitFor(() => {
      expect(screen.queryByLabelText('Código de seis dígitos')).toBeNull();
    });
    await user.type(screen.getByLabelText('Contraseña'), 'una frase propia');
    await user.click(screen.getByRole('button', { name: 'Confirmar' }));
    await vi.waitFor(() => {
      expect(screen.getByRole('button', { name: 'Acción delicada (2)' })).toBeVisible();
    });
    expect(sent.at(-1)?.body).toEqual({ password: 'una frase propia' });
  });
});

describe('confirme que es usted: errores y cancelación', () => {
  it('cancelar cierra la ventana sin repetir la acción', async () => {
    mockApi({ 'GET /v1/me/mfa': () => json(WITHOUT_FACTOR) });
    renderWithApi(<ActionThatNeedsReauth />);
    const user = userEvent.setup({ delay: null });
    await user.click(screen.getByRole('button', { name: /Acción delicada/ }));
    await user.click(await screen.findByRole('button', { name: 'Cancelar' }));
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(screen.getByRole('button', { name: 'Acción delicada (1)' })).toBeVisible();
  });

  it('pide los campos vacíos y, si la cuenta se bloquea, lleva a iniciar sesión', async () => {
    mockApi({
      'POST /v1/auth/reauthenticate': () => apiError(429, 'ACCOUNT_LOCKED', 'Bloqueada.'),
    });
    renderWithApi(<ActionThatNeedsReauth />);
    const user = userEvent.setup({ delay: null });
    await user.click(screen.getByRole('button', { name: /Acción delicada/ }));
    await user.click(await screen.findByRole('button', { name: 'Confirmar' }));
    expect(screen.getByText('Escriba su contraseña.')).toBeVisible();
    expect(screen.getByText('Escriba el código.')).toBeVisible();
    await user.click(screen.getByRole('button', { name: 'Usar un código de recuperación' }));
    await user.type(screen.getByLabelText('Contraseña'), 'una frase propia');
    await user.type(screen.getByLabelText('Código de recuperación'), 'ABCD-EFGH-JKMN-PQRS');
    await user.click(screen.getByRole('button', { name: 'Confirmar' }));
    await vi.waitFor(() => {
      expect(navigation.replace).toHaveBeenCalledWith('/iniciar-sesion?motivo=sesion-vencida');
    });
  });
});

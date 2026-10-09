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
import { SecondFactorSetup } from './second-factor-setup';

const navigation = vi.hoisted(() => ({
  replace: vi.fn(),
  search: new URLSearchParams(),
}));

vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace: navigation.replace }),
  useSearchParams: () => navigation.search,
}));

const PENDING = { ...SESSION, stage: 'second_factor_setup' } as const;
const SETUP = {
  secret: 'AAAABBBBCCCCDDDDEEEEFFFFGGGGHHHH',
  otpauth_uri: 'otpauth://totp/ARZA%20ONE:ana%40demo-uno.test?secret=X&issuer=ARZA%20ONE',
  expires_at: '2026-10-09T20:45:00.000Z',
};
const CODES = Array.from({ length: 10 }, (_, index) => `ABCD-EFGH-JKMN-PQR${String(index)}`);

beforeEach(() => {
  navigation.replace.mockReset();
  navigation.search = new URLSearchParams();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

async function showQr(): Promise<ReturnType<typeof userEvent.setup>> {
  const user = userEvent.setup({ delay: null });
  await user.click(await screen.findByRole('button', { name: 'Mostrar el código QR' }));
  return user;
}

describe('configurar el segundo factor', () => {
  it('muestra el QR, la clave para escribir a mano y el plazo en hora de Colombia', async () => {
    mockApi({
      'GET /v1/auth/session': () => json(PENDING),
      'POST /v1/auth/mfa/setup': () => json(SETUP),
    });
    renderWithApi(<SecondFactorSetup />);
    await showQr();
    expect(await screen.findByRole('img', { name: /Código QR/ })).toBeVisible();
    expect(screen.getByText('AAAA BBBB CCCC DDDD EEEE FFFF GGGG HHHH')).toBeVisible();
    expect(screen.getByText(/09\/10\/2026, 3:45/)).toBeVisible();
  });

  it('con el primer código entrega los diez códigos y solo sigue al confirmar que los guardó', async () => {
    navigation.search = new URLSearchParams({ volver: '/app/perfil' });
    const sent = mockApi({
      'GET /v1/auth/session': () => json(PENDING),
      'POST /v1/auth/mfa/setup': () => json(SETUP),
      'POST /v1/auth/mfa/setup/confirm': () => json({ recovery_codes: CODES, session: SESSION }),
    });
    renderWithApi(<SecondFactorSetup />);
    const user = await showQr();
    await user.type(await screen.findByLabelText('Código de seis dígitos'), '123456');
    await user.click(screen.getByRole('button', { name: 'Confirmar' }));
    const list = await screen.findByRole('list', { name: 'Códigos de recuperación' });
    expect(list.querySelectorAll('li')).toHaveLength(10);
    const next = screen.getByRole('button', { name: 'Continuar' });
    expect(next).toBeDisabled();
    await user.click(screen.getByLabelText(/Guardé mis códigos/));
    await user.click(next);
    expect(navigation.replace).toHaveBeenCalledWith('/app/perfil');
    expect(sent.at(-1)?.body).toEqual({ code: '123456' });
  });
});

describe('configurar el segundo factor: vencimiento', () => {
  it('si la configuración venció, vuelve a empezar con un QR nuevo', async () => {
    const message = 'La configuración venció o no se ha iniciado.';
    mockApi({
      'GET /v1/auth/session': () => json(PENDING),
      'POST /v1/auth/mfa/setup': () => json(SETUP),
      'POST /v1/auth/mfa/setup/confirm': () =>
        apiError(422, 'SECOND_FACTOR_SETUP_EXPIRED', message),
    });
    renderWithApi(<SecondFactorSetup />);
    const user = await showQr();
    await user.type(await screen.findByLabelText('Código de seis dígitos'), '123456');
    await user.click(screen.getByRole('button', { name: 'Confirmar' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(message);
    expect(screen.getByRole('button', { name: 'Mostrar el código QR' })).toBeVisible();
  });
});

describe('cambiar de celular desde el perfil', () => {
  it('si la API lo pide, confirma la identidad y repite el paso', async () => {
    let attempts = 0;
    const sent = mockApi({
      'GET /v1/auth/session': () => json(SESSION),
      'GET /v1/me/mfa': () =>
        json({ required: true, enabled: true, confirmed_at: null, recovery_codes_remaining: 8 }),
      'POST /v1/auth/mfa/setup': () => {
        attempts += 1;
        return attempts === 1
          ? apiError(403, 'REAUTHENTICATION_REQUIRED', 'Confirme que es usted.')
          : json(SETUP);
      },
      'POST /v1/auth/reauthenticate': () => noContent(),
    });
    renderWithApi(<SecondFactorSetup />);
    const user = await showQr();
    const dialog = await screen.findByRole('dialog', { name: 'Confirme que es usted' });
    expect(dialog).toBeVisible();
    await user.type(screen.getByLabelText('Contraseña'), 'una frase propia');
    await user.type(screen.getByLabelText('Código de seis dígitos'), '654321');
    await user.click(screen.getByRole('button', { name: 'Confirmar' }));
    expect(await screen.findByRole('img', { name: /Código QR/ })).toBeVisible();
    const reauth = sent.find((request) => request.path === '/v1/auth/reauthenticate');
    expect(reauth?.body).toEqual({ password: 'una frase propia', code: '654321' });
  });
});

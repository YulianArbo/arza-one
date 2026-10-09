import { screen } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { SESSION, apiError, json, mockApi, renderWithApi } from '../../test-support/fake-api';
import { SecondFactorForm } from './second-factor-form';

const navigation = vi.hoisted(() => ({
  replace: vi.fn(),
  search: new URLSearchParams(),
}));

vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace: navigation.replace }),
  useSearchParams: () => navigation.search,
}));

const PENDING = { ...SESSION, stage: 'second_factor' } as const;

beforeEach(() => {
  navigation.replace.mockReset();
  navigation.search = new URLSearchParams();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

async function typeAndVerify(label: string, value: string): Promise<void> {
  const user = userEvent.setup({ delay: null });
  await user.type(await screen.findByLabelText(label), value);
  await user.click(screen.getByRole('button', { name: 'Verificar' }));
}

describe('segundo paso del inicio de sesión', () => {
  it('envía el código con el código antifalsificación y vuelve a donde iba', async () => {
    navigation.search = new URLSearchParams({ volver: '/app/perfil' });
    const sent = mockApi({
      'GET /v1/auth/session': () => json(PENDING),
      'POST /v1/auth/mfa/verify': () => json(SESSION),
    });
    renderWithApi(<SecondFactorForm />);
    await typeAndVerify('Código de seis dígitos', '123 456');
    await vi.waitFor(() => {
      expect(navigation.replace).toHaveBeenCalledWith('/app/perfil');
    });
    const verify = sent.find((request) => request.path === '/v1/auth/mfa/verify');
    expect(verify?.body).toEqual({ code: '123456' });
    expect(verify?.headers['X-CSRF-Token']).toBe('codigo-de-prueba');
  });

  it('permite usar un código de recuperación', async () => {
    const sent = mockApi({
      'GET /v1/auth/session': () => json(PENDING),
      'POST /v1/auth/mfa/verify': () => json(SESSION),
    });
    renderWithApi(<SecondFactorForm />);
    const user = userEvent.setup({ delay: null });
    await user.click(await screen.findByRole('button', { name: /usar un código de recuperación/ }));
    await typeAndVerify('Código de recuperación', 'ABCD-EFGH-JKMN-PQRS');
    await vi.waitFor(() => {
      expect(sent.at(-1)?.body).toEqual({ recovery_code: 'ABCD-EFGH-JKMN-PQRS' });
    });
  });
});

describe('segundo paso: errores', () => {
  it('muestra el mensaje de la API si el código no sirve', async () => {
    const message = 'El código no es correcto, ya se usó o venció.';
    mockApi({
      'GET /v1/auth/session': () => json(PENDING),
      'POST /v1/auth/mfa/verify': () => apiError(422, 'SECOND_FACTOR_CODE_INVALID', message),
    });
    renderWithApi(<SecondFactorForm />);
    await typeAndVerify('Código de seis dígitos', '000000');
    expect(await screen.findByRole('alert')).toHaveTextContent(message);
    expect(navigation.replace).not.toHaveBeenCalled();
  });
});

describe('segundo paso: a dónde lleva cada sesión', () => {
  it('pide el código vacío sin llamar a la API', async () => {
    const sent = mockApi({ 'GET /v1/auth/session': () => json(PENDING) });
    renderWithApi(<SecondFactorForm />);
    await userEvent
      .setup({ delay: null })
      .click(await screen.findByRole('button', { name: 'Verificar' }));
    expect(screen.getByText('Escriba el código.')).toBeVisible();
    expect(sent.map((request) => request.path)).toEqual(['/v1/auth/session']);
  });

  it('a quien le falta configurarlo lo lleva a la configuración', async () => {
    mockApi({ 'GET /v1/auth/session': () => json({ ...SESSION, stage: 'second_factor_setup' }) });
    renderWithApi(<SecondFactorForm />);
    await vi.waitFor(() => {
      expect(navigation.replace).toHaveBeenCalledWith('/segundo-factor/configurar');
    });
  });

  it('si la sesión venció, lleva a iniciar sesión', async () => {
    mockApi({
      'GET /v1/auth/session': () => apiError(401, 'UNAUTHENTICATED', 'Debe iniciar sesión.'),
    });
    renderWithApi(<SecondFactorForm />);
    await vi.waitFor(() => {
      expect(navigation.replace).toHaveBeenCalledWith('/iniciar-sesion?motivo=sesion-vencida');
    });
  });
});

describe('segundo paso: fallas al cargar', () => {
  it('si la sesión no carga por una falla, explica el problema', async () => {
    mockApi({
      'GET /v1/auth/session': () => apiError(500, 'INTERNAL_ERROR', 'Ocurrió un error inesperado.'),
    });
    renderWithApi(<SecondFactorForm />);
    expect(await screen.findByText('Ocurrió un error inesperado.')).toBeVisible();
  });

  it('se puede volver del código de recuperación al de la aplicación', async () => {
    mockApi({ 'GET /v1/auth/session': () => json(PENDING) });
    renderWithApi(<SecondFactorForm />);
    const user = userEvent.setup({ delay: null });
    await user.click(await screen.findByRole('button', { name: /usar un código de recuperación/ }));
    await user.click(screen.getByRole('button', { name: 'Usar el código de la aplicación' }));
    expect(screen.getByLabelText('Código de seis dígitos')).toBeVisible();
  });

  it('una sesión ya completa vuelve a la aplicación', async () => {
    mockApi({ 'GET /v1/auth/session': () => json(SESSION) });
    renderWithApi(<SecondFactorForm />);
    await vi.waitFor(() => {
      expect(navigation.replace).toHaveBeenCalledWith('/app');
    });
  });
});

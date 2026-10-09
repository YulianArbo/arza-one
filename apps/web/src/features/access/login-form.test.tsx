import { screen } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { SESSION, apiError, json, mockApi, renderWithApi } from '../../test-support/fake-api';
import { ForgotPasswordForm } from './forgot-password-form';
import { LoginForm } from './login-form';

const navigation = vi.hoisted(() => ({
  replace: vi.fn(),
  search: new URLSearchParams(),
}));

vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace: navigation.replace }),
  useSearchParams: () => navigation.search,
}));

beforeEach(() => {
  navigation.replace.mockReset();
  navigation.search = new URLSearchParams();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

async function fillLogin(email: string, password: string): Promise<void> {
  const user = userEvent.setup({ delay: null });
  await user.type(screen.getByLabelText('Correo electrónico'), email);
  await user.type(screen.getByLabelText('Contraseña'), password);
  await user.click(screen.getByRole('button', { name: 'Iniciar sesión' }));
}

describe('inicio de sesión', () => {
  it('envía correo y contraseña y lleva a la aplicación', async () => {
    const sent = mockApi({ 'POST /v1/auth/login': () => json(SESSION) });
    renderWithApi(<LoginForm />);
    await fillLogin('ana@demo-uno.test', 'una frase propia');
    await vi.waitFor(() => {
      expect(navigation.replace).toHaveBeenCalledWith('/app');
    });
    expect(sent[0]?.body).toEqual({ email: 'ana@demo-uno.test', password: 'una frase propia' });
  });

  it('con segundo factor lleva al segundo paso sin perder a dónde volver (B09)', async () => {
    navigation.search = new URLSearchParams({ volver: '/app/perfil' });
    const pending = { ...SESSION, stage: 'second_factor_setup' };
    mockApi({ 'POST /v1/auth/login': () => json(pending) });
    renderWithApi(<LoginForm />);
    await fillLogin('ana@demo-uno.test', 'una frase propia');
    await vi.waitFor(() => {
      expect(navigation.replace).toHaveBeenCalledWith(
        '/segundo-factor/configurar?volver=%2Fapp%2Fperfil',
      );
    });
  });

  it('vuelve a la pantalla de donde venía', async () => {
    navigation.search = new URLSearchParams({ volver: '/app/perfil' });
    mockApi({ 'POST /v1/auth/login': () => json(SESSION) });
    renderWithApi(<LoginForm />);
    await fillLogin('ana@demo-uno.test', 'una frase propia');
    await vi.waitFor(() => {
      expect(navigation.replace).toHaveBeenCalledWith('/app/perfil');
    });
  });
});

describe('inicio de sesión: errores y avisos', () => {
  it('muestra el mensaje de la API sin decir si el correo existe', async () => {
    const message = 'El correo o la contraseña no son correctos.';
    mockApi({ 'POST /v1/auth/login': () => apiError(401, 'INVALID_CREDENTIALS', message) });
    renderWithApi(<LoginForm />);
    await fillLogin('ana@demo-uno.test', 'equivocada');
    expect(await screen.findByRole('alert')).toHaveTextContent(message);
    expect(screen.queryByText(/corr-1234/)).toBeNull();
  });

  it('pide los campos vacíos sin llamar a la API', async () => {
    const sent = mockApi({});
    renderWithApi(<LoginForm />);
    await userEvent
      .setup({ delay: null })
      .click(screen.getByRole('button', { name: 'Iniciar sesión' }));
    expect(screen.getByText('Escriba su correo.')).toBeVisible();
    expect(screen.getByText('Escriba su contraseña.')).toBeVisible();
    expect(sent).toEqual([]);
  });

  it('muestra el aviso del motivo por el que llegó', () => {
    navigation.search = new URLSearchParams({ motivo: 'contrasena-cambiada' });
    mockApi({});
    renderWithApi(<LoginForm />);
    expect(screen.getByText(/Su contraseña cambió/)).toBeVisible();
  });
});

describe('recuperar la contraseña', () => {
  it('muestra el mismo mensaje que entrega la API', async () => {
    const message = 'Si el correo corresponde a una cuenta activa, en unos minutos recibirá…';
    mockApi({ 'POST /v1/auth/password/forgot': () => json({ message }, 202) });
    renderWithApi(<ForgotPasswordForm />);
    const user = userEvent.setup({ delay: null });
    await user.type(screen.getByLabelText('Correo electrónico'), 'ana@demo-uno.test');
    await user.click(screen.getByRole('button', { name: 'Enviar enlace' }));
    expect(await screen.findByText(message)).toBeVisible();
  });

  it('pide el correo si está vacío', async () => {
    mockApi({});
    renderWithApi(<ForgotPasswordForm />);
    await userEvent
      .setup({ delay: null })
      .click(screen.getByRole('button', { name: 'Enviar enlace' }));
    expect(screen.getByText('Escriba su correo.')).toBeVisible();
  });

  it('sin conexión lo dice con claridad', async () => {
    mockApi({});
    renderWithApi(<ForgotPasswordForm />);
    const user = userEvent.setup({ delay: null });
    await user.type(screen.getByLabelText('Correo electrónico'), 'ana@demo-uno.test');
    await user.click(screen.getByRole('button', { name: 'Enviar enlace' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('No pudimos comunicarnos');
  });
});

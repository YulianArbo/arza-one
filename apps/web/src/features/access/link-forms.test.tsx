import { screen } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { apiError, mockApi, noContent, renderWithApi } from '../../test-support/fake-api';
import { ActivateAccount, ResetPassword } from './link-forms';

const navigation = vi.hoisted(() => ({ replace: vi.fn() }));

vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace: navigation.replace }),
}));

const TOKEN = 'a'.repeat(43);
const PASSWORD = 'mango biche con sal';

function openLink(path: string, hash: string): void {
  window.history.replaceState(null, '', `${path}${hash}`);
}

beforeEach(() => {
  navigation.replace.mockReset();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

async function typePasswords(first: string, second: string): Promise<void> {
  const user = userEvent.setup({ delay: null });
  await user.type(screen.getByLabelText('Contraseña'), first);
  await user.type(screen.getByLabelText('Repita la contraseña'), second);
}

describe('activar la cuenta', () => {
  it('envía la llave, el nombre y la contraseña; luego lleva a iniciar sesión', async () => {
    openLink('/activar-cuenta', `#token=${TOKEN}`);
    const sent = mockApi({ 'POST /v1/auth/invitation/accept': noContent });
    renderWithApi(<ActivateAccount />);
    await userEvent
      .setup({ delay: null })
      .type(await screen.findByLabelText('Su nombre'), 'Ana Pérez');
    await typePasswords(PASSWORD, PASSWORD);
    await userEvent
      .setup({ delay: null })
      .click(screen.getByRole('button', { name: 'Activar cuenta' }));
    await vi.waitFor(() => {
      expect(navigation.replace).toHaveBeenCalledWith('/iniciar-sesion?motivo=cuenta-activada');
    });
    expect(sent[0]?.body).toEqual({ token: TOKEN, display_name: 'Ana Pérez', password: PASSWORD });
  });

  it('quita la llave de la barra de direcciones al leerla', async () => {
    openLink('/activar-cuenta', `#token=${TOKEN}`);
    mockApi({});
    renderWithApi(<ActivateAccount />);
    await screen.findByLabelText('Su nombre');
    expect(window.location.hash).toBe('');
  });
});

describe('activar la cuenta: datos y enlaces incompletos', () => {
  it('revisa los datos antes de enviarlos', async () => {
    openLink('/activar-cuenta', `#token=${TOKEN}`);
    const sent = mockApi({});
    renderWithApi(<ActivateAccount />);
    await screen.findByLabelText('Su nombre');
    await typePasswords('corta', 'otra');
    await userEvent
      .setup({ delay: null })
      .click(screen.getByRole('button', { name: 'Activar cuenta' }));
    expect(screen.getByText('Escriba su nombre.')).toBeVisible();
    expect(screen.getByText('Escriba al menos 12 caracteres.')).toBeVisible();
    expect(screen.getByText('Las dos contraseñas no coinciden.')).toBeVisible();
    expect(screen.getByLabelText('Contraseña')).toHaveAttribute('aria-invalid', 'true');
    expect(sent).toEqual([]);
  });

  it('sin llave en el enlace explica qué hacer', async () => {
    openLink('/activar-cuenta', '');
    mockApi({});
    renderWithApi(<ActivateAccount />);
    expect(await screen.findByText('El enlace no está completo')).toBeVisible();
    expect(screen.getByRole('link', { name: 'Pedir un enlace nuevo' })).toBeVisible();
  });
});

describe('crear una contraseña nueva con el enlace', () => {
  it('guarda la contraseña y lleva a iniciar sesión', async () => {
    openLink('/restablecer-contrasena', `#token=${TOKEN}`);
    const sent = mockApi({ 'POST /v1/auth/password/reset': noContent });
    renderWithApi(<ResetPassword />);
    await screen.findByLabelText('Contraseña nueva');
    const user = userEvent.setup({ delay: null });
    await user.type(screen.getByLabelText('Contraseña nueva'), PASSWORD);
    await user.type(screen.getByLabelText('Repita la contraseña'), PASSWORD);
    await user.click(screen.getByRole('button', { name: 'Guardar contraseña' }));
    await vi.waitFor(() => {
      expect(navigation.replace).toHaveBeenCalledWith(
        '/iniciar-sesion?motivo=contrasena-restablecida',
      );
    });
    expect(sent[0]?.body).toEqual({ token: TOKEN, password: PASSWORD });
  });

  it('muestra el error de la API, por ejemplo un enlace vencido', async () => {
    openLink('/restablecer-contrasena', `#token=${TOKEN}`);
    const message = 'El enlace no es válido, ya se usó o venció. Pida uno nuevo.';
    mockApi({ 'POST /v1/auth/password/reset': () => apiError(422, 'LINK_INVALID', message) });
    renderWithApi(<ResetPassword />);
    await screen.findByLabelText('Contraseña nueva');
    const user = userEvent.setup({ delay: null });
    await user.type(screen.getByLabelText('Contraseña nueva'), PASSWORD);
    await user.type(screen.getByLabelText('Repita la contraseña'), PASSWORD);
    await user.click(screen.getByRole('button', { name: 'Guardar contraseña' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(message);
  });
});

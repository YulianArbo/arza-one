import { screen, within } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import type { JSX } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { SESSION, json, mockApi, renderWithApi } from '../../test-support/fake-api';
import { RequireSession } from '../session/session-provider';
import { SecondFactorCard } from './second-factor-card';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace: vi.fn() }),
  usePathname: () => '/app/perfil',
}));

const ENABLED = {
  required: true,
  enabled: true,
  confirmed_at: '2026-10-09T15:00:00.000Z',
  recovery_codes_remaining: 2,
};
const CODES = Array.from({ length: 10 }, (_, index) => `ABCD-EFGH-JKMN-PQR${String(index)}`);

function Card(): JSX.Element {
  return (
    <RequireSession kind="internal">
      <SecondFactorCard />
    </RequireSession>
  );
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('segundo factor en Mi perfil', () => {
  it('muestra desde cuándo está activo, cuántos códigos quedan y si es obligatorio', async () => {
    mockApi({ 'GET /v1/auth/session': () => json(SESSION), 'GET /v1/me/mfa': () => json(ENABLED) });
    renderWithApi(<Card />);
    expect(await screen.findByText('Activo desde el 09/10/2026, 10:00 a. m.')).toBeVisible();
    expect(screen.getByText(/Le quedan pocos/)).toBeVisible();
    expect(screen.getByText('Es obligatorio para su tipo de usuario.')).toBeVisible();
    expect(screen.queryByRole('button', { name: 'Desactivar' })).toBeNull();
    expect(screen.getByRole('link', { name: 'Cambiar de celular' })).toHaveAttribute(
      'href',
      '/segundo-factor/configurar?volver=%2Fapp%2Fperfil',
    );
  });

  it('genera códigos nuevos y los muestra una sola vez', async () => {
    mockApi({
      'GET /v1/auth/session': () => json(SESSION),
      'GET /v1/me/mfa': () => json(ENABLED),
      'POST /v1/me/mfa/recovery-codes': () => json({ recovery_codes: CODES }),
    });
    renderWithApi(<Card />);
    const user = userEvent.setup({ delay: null });
    await user.click(await screen.findByRole('button', { name: 'Generar códigos nuevos' }));
    const dialog = await screen.findByRole('dialog', {
      name: 'Sus códigos de recuperación nuevos',
    });
    expect(within(dialog).getAllByRole('listitem')).toHaveLength(10);
    await user.click(within(dialog).getByLabelText(/Guardé mis códigos/));
    await user.click(within(dialog).getByRole('button', { name: 'Listo' }));
    expect(screen.queryByRole('dialog')).toBeNull();
  });
});

describe('segundo factor opcional en Mi perfil', () => {
  it('si es opcional y no está activo, invita a activarlo', async () => {
    const optional = { ...ENABLED, required: false, enabled: false, confirmed_at: null };
    mockApi({
      'GET /v1/auth/session': () => json(SESSION),
      'GET /v1/me/mfa': () => json(optional),
    });
    renderWithApi(<Card />);
    expect(await screen.findByRole('link', { name: 'Activar el segundo factor' })).toBeVisible();
  });

  it('si es opcional y está activo, se puede desactivar', async () => {
    const optional = { ...ENABLED, required: false };
    mockApi({
      'GET /v1/auth/session': () => json(SESSION),
      'GET /v1/me/mfa': () => json(optional),
    });
    renderWithApi(<Card />);
    expect(await screen.findByRole('button', { name: 'Desactivar' })).toBeVisible();
  });
});

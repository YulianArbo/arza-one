import { screen, within } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import type { ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { json, noContent, renderWithApi } from '../../test-support/fake-api';
import {
  CLIENT_ADMIN,
  MY_EXPORT,
  PROJECT_ID,
  PortalScreen,
  USER_ID,
  servePortal,
} from '../../test-support/portal-fixtures';
import { PortalMyDataPage } from './portal-my-data';
import { PortalUsersPage } from './portal-users';

// Usuarios de mi empresa y Mis datos (B30). Datos ficticios.

vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace: vi.fn(), push: vi.fn(), back: vi.fn() }),
  usePathname: () => '/portal/usuarios',
}));

beforeEach(() => {
  vi.stubGlobal('scrollTo', vi.fn());
  vi.stubGlobal(
    'URL',
    Object.assign(URL, { createObjectURL: vi.fn(() => 'blob:x'), revokeObjectURL: vi.fn() }),
  );
});

afterEach(() => {
  vi.unstubAllGlobals();
});

function show(ui: ReactNode): void {
  renderWithApi(<PortalScreen>{ui}</PortalScreen>);
}

describe('usuarios de mi empresa', () => {
  it('invita a una persona después de validar', async () => {
    const sent = servePortal(CLIENT_ADMIN, {
      'POST /v1/portal/users': () => json({ id: USER_ID }, 201),
    });
    show(<PortalUsersPage />);
    await userEvent.click(await screen.findByRole('button', { name: 'Invitar a una persona' }));
    const dialog = await screen.findByRole('dialog');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Enviar invitación' }));
    expect(within(dialog).getAllByText('Revise el correo.').length).toBeGreaterThan(0);
    await userEvent.type(within(dialog).getByLabelText('Nombre'), 'Marta Cliente');
    await userEvent.type(within(dialog).getByLabelText('Correo'), 'Marta@Cliente.test');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Enviar invitación' }));
    await vi.waitFor(() => {
      const invite = sent.find((r) => r.method === 'POST' && r.path === '/v1/portal/users');
      expect(invite?.body).toEqual({
        email: 'marta@cliente.test',
        display_name: 'Marta Cliente',
        role: 'CLIENTE_USUARIO',
      });
    });
  });
});

describe('usuarios de mi empresa: cambios', () => {
  it('cambia el rol, desactiva y asigna proyectos a otro usuario, nunca a sí mismo', async () => {
    const sent = servePortal(CLIENT_ADMIN, {
      [`PUT /v1/portal/users/${USER_ID}`]: () => noContent(),
      [`PUT /v1/portal/users/${USER_ID}/projects`]: () => noContent(),
    });
    show(<PortalUsersPage />);
    expect(await screen.findByText('(usted)')).toBeVisible();
    expect(screen.getAllByRole('button', { name: 'Desactivar' })).toHaveLength(1);
    await userEvent.click(screen.getByRole('button', { name: 'Cambiar a administrador' }));
    await userEvent.click(screen.getByRole('button', { name: 'Desactivar' }));
    await userEvent.click(screen.getByLabelText(/Portal de autogestión/u));
    await userEvent.click(screen.getByRole('button', { name: 'Guardar proyectos' }));
    await vi.waitFor(() => {
      const puts = sent.filter((r) => r.method === 'PUT');
      expect(puts.map((r) => r.body)).toEqual([
        { role: 'CLIENTE_ADMIN', active: true },
        { role: 'CLIENTE_USUARIO', active: false },
        { project_ids: [PROJECT_ID] },
      ]);
      expect(puts[0]?.headers['If-Match']).toBe('"3"');
    });
  });
});

describe('mis datos', () => {
  it('muestra sus datos, corrige su nombre y descarga la copia', async () => {
    const sent = servePortal(CLIENT_ADMIN, {
      'PUT /v1/portal/me': () => noContent(),
      'POST /v1/portal/me/export': () => json(MY_EXPORT, 201),
    });
    show(<PortalMyDataPage />);
    expect(await screen.findByText('Demo Uno S.A.S.')).toBeVisible();
    await userEvent.clear(screen.getByLabelText('Su nombre'));
    await userEvent.click(screen.getByRole('button', { name: 'Guardar' }));
    expect(screen.getByText('Escriba su nombre.')).toBeVisible();
    await userEvent.type(screen.getByLabelText('Su nombre'), 'Ana María Cliente');
    await userEvent.click(screen.getByRole('button', { name: 'Guardar' }));
    await userEvent.click(screen.getByRole('button', { name: 'Descargar mis datos' }));
    await vi.waitFor(() => {
      expect(sent.find((r) => r.method === 'PUT')?.body).toEqual({
        display_name: 'Ana María Cliente',
      });
      expect(sent.some((r) => r.path === '/v1/portal/me/export')).toBe(true);
    });
  });
});

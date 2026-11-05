import { screen, within } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import type { JSX } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  ADMIN_PERMISSIONS,
  DIRECTOR_PERMISSIONS,
  ROLES,
  summary,
} from '../../test-support/admin-fixtures';
import { SESSION, apiError, json, mockApi, renderWithApi } from '../../test-support/fake-api';
import { ORGANIZATION } from '../../test-support/party-fixtures';
import { RequireSession } from '../session/session-provider';
import { UserList } from './user-list';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace: vi.fn(), push: vi.fn() }),
  usePathname: () => '/app/administracion/usuarios',
}));

const CURSOR = '01999a00-0000-7000-8000-00000000e001';

function Screen(): JSX.Element {
  return (
    <RequireSession kind="internal">
      <UserList />
    </RequireSession>
  );
}

function serve(permissions: object, extra: Record<string, () => Response> = {}) {
  return mockApi({
    'GET /v1/auth/session': () => json(SESSION),
    'GET /v1/me/permissions': () => json(permissions),
    'GET /v1/roles': () => json(ROLES),
    'GET /v1/users': (request) => {
      return !request.search.includes('cursor=')
        ? json({ data: [summary()], next_cursor: CURSOR })
        : json({
            data: [summary({ email: 'otra@demo-uno.test', display_name: null })],
            next_cursor: null,
          });
    },
    ...extra,
  });
}

beforeEach(() => {
  vi.stubGlobal('scrollTo', vi.fn());
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('lista de usuarios', () => {
  it('muestra a cada persona con su estado, roles y último ingreso', async () => {
    serve(DIRECTOR_PERMISSIONS);
    renderWithApi(<Screen />);
    const link = await screen.findByRole('link', { name: 'Luis Gómez' });
    const row = link.closest('tr');
    if (row === null) throw new Error('Falta la fila');
    expect(row).toHaveTextContent('Activo');
    expect(row).toHaveTextContent('Comercial');
    expect(row).toHaveTextContent('09/10/2026');
    // DIRECCION lee usuarios pero no invita (permiso iam.user.invite).
    expect(screen.queryByRole('button', { name: 'Invitar a una persona' })).toBeNull();
  });

  it('pasa de página con el cursor y vuelve a la anterior', async () => {
    const sent = serve(DIRECTOR_PERMISSIONS);
    renderWithApi(<Screen />);
    await userEvent.click(await screen.findByRole('button', { name: 'Página siguiente' }));
    expect(await screen.findByText('otra@demo-uno.test', { selector: 'a' })).toBeVisible();
    const next = sent.filter((request) => request.path === '/v1/users').at(-1);
    expect(next?.search).toContain(`cursor=${CURSOR}`);
    await userEvent.click(screen.getByRole('button', { name: 'Página anterior' }));
    expect(await screen.findByRole('link', { name: 'Luis Gómez' })).toBeVisible();
  });
});

describe('búsqueda de usuarios', () => {
  it('busca por texto y por estado', async () => {
    const sent = serve(DIRECTOR_PERMISSIONS);
    renderWithApi(<Screen />);
    await screen.findByRole('link', { name: 'Luis Gómez' });
    await userEvent.type(screen.getByLabelText('Buscar por nombre o correo'), 'luis');
    await userEvent.selectOptions(screen.getByLabelText('Estado'), 'locked');
    await userEvent.click(screen.getByRole('button', { name: 'Buscar' }));
    await vi.waitFor(() => {
      const last = sent.filter((request) => request.path === '/v1/users').at(-1);
      expect(last?.search).toBe('?limit=25&q=luis&status=locked');
    });
  });

  it('sin resultados lo explica', async () => {
    serve(DIRECTOR_PERMISSIONS, {
      'GET /v1/users': () => json({ data: [], next_cursor: null }),
    });
    renderWithApi(<Screen />);
    expect(await screen.findByText('No hay usuarios con esos filtros')).toBeVisible();
  });
});

describe('invitar desde la lista', () => {
  it('envía el correo, el tipo y los roles elegidos; COLABORADOR va siempre', async () => {
    const sent = serve(ADMIN_PERMISSIONS, {
      'POST /v1/users': () => json({ id: CURSOR, outcome: 'invited' }, 201),
    });
    renderWithApi(<Screen />);
    await userEvent.click(await screen.findByRole('button', { name: 'Invitar a una persona' }));
    const dialog = await screen.findByRole('dialog');
    await userEvent.type(within(dialog).getByLabelText('Correo'), 'nueva@demo-uno.test');
    await userEvent.click(await within(dialog).findByLabelText('Comercial'));
    expect(within(dialog).queryByLabelText('Administrador del cliente')).toBeNull();
    expect(within(dialog).queryByLabelText('Auditor')).toBeNull();
    await userEvent.click(within(dialog).getByRole('button', { name: 'Enviar invitación' }));
    expect(await screen.findByText('Enviamos la invitación a nueva@demo-uno.test.')).toBeVisible();
    const invite = sent.find((request) => request.method === 'POST');
    expect(invite?.body).toEqual({
      email: 'nueva@demo-uno.test',
      display_name: null,
      kind: 'internal',
      role_ids: [ROLES.data[0]?.['id']],
      party_id: null,
    });
    expect(invite?.headers['X-CSRF-Token']).toBe(SESSION.csrf_token);
  });
});

describe('invitar a una persona del portal (B22A)', () => {
  it('para el portal pide la empresa cliente, ofrece sus roles y muestra el error de la API', async () => {
    const sent = serve(ADMIN_PERMISSIONS, {
      'POST /v1/users': () => apiError(409, 'EMAIL_TAKEN', 'Ya existe una cuenta con ese correo.'),
      'GET /v1/parties': () => json({ data: [ORGANIZATION], next_cursor: null }),
    });
    renderWithApi(<Screen />);
    await userEvent.click(await screen.findByRole('button', { name: 'Invitar a una persona' }));
    const dialog = await screen.findByRole('dialog');
    await userEvent.selectOptions(within(dialog).getByLabelText('Tipo de usuario'), 'portal');
    expect(await within(dialog).findByLabelText('Administrador del cliente')).toBeVisible();
    await userEvent.type(within(dialog).getByLabelText('Nombre (opcional)'), 'Cliente');
    await userEvent.type(within(dialog).getByLabelText('Correo'), 'cliente@cliente.test');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Enviar invitación' }));
    expect(
      await within(dialog).findByText('Elija la empresa cliente de esta persona.'),
    ).toBeVisible();
    expect(sent.some((request) => request.method === 'POST')).toBe(false);
    await userEvent.selectOptions(
      await within(dialog).findByLabelText('Empresa cliente'),
      ORGANIZATION.id,
    );
    await userEvent.click(within(dialog).getByRole('button', { name: 'Enviar invitación' }));
    expect(await within(dialog).findByText('Ya existe una cuenta con ese correo.')).toBeVisible();
    const invite = sent.find((request) => request.method === 'POST');
    expect(invite?.body).toMatchObject({ kind: 'portal', party_id: ORGANIZATION.id });
  });
});

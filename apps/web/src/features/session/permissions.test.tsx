import { screen } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import type { JSX } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  ADMIN_PERMISSIONS,
  NO_PERMISSIONS,
  WORKER_PERMISSIONS,
} from '../../test-support/admin-fixtures';
import { SESSION, apiError, json, mockApi, renderWithApi } from '../../test-support/fake-api';
import { AdminHome } from '../administration/admin-home';
import { ModulePage } from '../modules/module-page';
import { MyRolesCard } from '../profile/my-roles-card';
import { RequireSession } from './session-provider';
import { RequirePermission, permissionViewOf } from './permissions';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace: vi.fn(), push: vi.fn() }),
  usePathname: () => '/app/administracion',
}));

afterEach(() => {
  vi.unstubAllGlobals();
});

function withSession(ui: JSX.Element): JSX.Element {
  return <RequireSession kind="internal">{ui}</RequireSession>;
}

function serve(permissions: object): void {
  mockApi({
    'GET /v1/auth/session': () => json(SESSION),
    'GET /v1/me/permissions': () => json(permissions),
  });
}

describe('permisos de la persona en la web', () => {
  it('distingue «todo» de «solo lo propio»', () => {
    const view = permissionViewOf(WORKER_PERMISSIONS);
    expect(view.can('iam.delegation.manage')).toBe(true);
    expect(view.canAll('iam.delegation.manage')).toBe(false);
    expect(view.canAll('finance.expense.approve')).toBe(true);
    expect(permissionViewOf(undefined).ready).toBe(false);
  });

  it('sin el permiso muestra «Sin permiso» y no la pantalla', async () => {
    serve(NO_PERMISSIONS);
    renderWithApi(
      withSession(
        <RequirePermission anyOf={['iam.user.read']}>
          <p>Lista secreta</p>
        </RequirePermission>,
      ),
    );
    expect(await screen.findByRole('alert')).toHaveTextContent('No tiene acceso a esta sección');
    expect(screen.queryByText('Lista secreta')).toBeNull();
  });

  it('con el permiso muestra la pantalla', async () => {
    serve(ADMIN_PERMISSIONS);
    renderWithApi(
      withSession(
        <RequirePermission anyOf={['iam.user.read']}>
          <p>Lista de usuarios</p>
        </RequirePermission>,
      ),
    );
    expect(await screen.findByText('Lista de usuarios')).toBeVisible();
  });
});

describe('permisos que no cargan', () => {
  it('si los permisos no cargan, ofrece reintentar', async () => {
    mockApi({
      'GET /v1/auth/session': () => json(SESSION),
      'GET /v1/me/permissions': () => apiError(503, 'SERVICE_UNAVAILABLE', 'Intente más tarde.'),
    });
    renderWithApi(withSession(<RequirePermission anyOf={['iam.user.read']}>x</RequirePermission>));
    expect(await screen.findByText('Intente más tarde.')).toBeVisible();
    await userEvent.click(screen.getByRole('button', { name: /reintentar/i }));
  });
});

describe('administración y módulos según el permiso', () => {
  it('el colaborador solo ve Delegaciones en Administración', async () => {
    serve(WORKER_PERMISSIONS);
    renderWithApi(withSession(<AdminHome />));
    const sections = await screen.findByRole('list', { name: 'Secciones de administración' });
    expect(sections).toHaveTextContent('Delegaciones');
    expect(sections).not.toHaveTextContent('Usuarios');
  });

  it('sin ninguna sección, Administración dice que no tiene acceso', async () => {
    serve(NO_PERMISSIONS);
    renderWithApi(withSession(<AdminHome />));
    expect(await screen.findByRole('alert')).toHaveTextContent('No tiene acceso');
  });

  it('un módulo en construcción respeta los permisos', async () => {
    serve(NO_PERMISSIONS);
    renderWithApi(withSession(<ModulePage slug="finanzas" />));
    expect(await screen.findByRole('alert')).toHaveTextContent('No tiene acceso');
  });

  it('Mi perfil muestra los roles vigentes', async () => {
    serve(ADMIN_PERMISSIONS);
    renderWithApi(withSession(<MyRolesCard />));
    const roles = await screen.findByRole('list', { name: 'Sus roles' });
    expect(roles).toHaveTextContent('Administrador de plataforma');
  });

  it('Mi perfil avisa si la persona no tiene roles', async () => {
    serve(NO_PERMISSIONS);
    renderWithApi(withSession(<MyRolesCard />));
    expect(await screen.findByText('Todavía no tiene roles asignados.')).toBeVisible();
  });
});

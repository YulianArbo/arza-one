import { screen, within } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import type { JSX, ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  ADMIN_PERMISSIONS,
  CATALOG,
  DIRECTOR_PERMISSIONS,
  ROLE_COMERCIAL,
  ROLE_CUSTOM,
  ROLES,
  role,
} from '../../test-support/admin-fixtures';
import { SESSION, apiError, json, mockApi, renderWithApi } from '../../test-support/fake-api';
import { RequireSession } from '../session/session-provider';
import { RoleCreatePanel } from './role-create';
import { RoleDetailPanel } from './role-detail';
import { RoleList } from './role-list';

const push = vi.fn();

vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace: vi.fn(), push }),
  usePathname: () => '/app/administracion/roles',
}));

function Screen({ children }: { readonly children: ReactNode }): JSX.Element {
  return <RequireSession kind="internal">{children}</RequireSession>;
}

const SYSTEM_DETAIL = {
  ...role(),
  permissions: [{ code: 'crm.lead.read', scope: 'all' }],
};
const CUSTOM_DETAIL = {
  ...role({
    id: ROLE_CUSTOM,
    name: 'Apoyo comercial',
    is_system: false,
    version: 4,
    description: null,
  }),
  permissions: [{ code: 'service.ticket.read', scope: 'own' }],
};

function serve(permissions: object, extra: Record<string, () => Response> = {}) {
  return mockApi({
    'GET /v1/auth/session': () => json(SESSION),
    'GET /v1/me/permissions': () => json(permissions),
    'GET /v1/roles': () => json(ROLES),
    'GET /v1/permissions': () => json(CATALOG),
    [`GET /v1/roles/${ROLE_COMERCIAL}`]: () => json(SYSTEM_DETAIL),
    [`GET /v1/roles/${ROLE_CUSTOM}`]: () => json(CUSTOM_DETAIL),
    ...extra,
  });
}

beforeEach(() => {
  vi.stubGlobal('scrollTo', vi.fn());
  push.mockClear();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('lista y ficha de roles', () => {
  it('lista los roles; solo quien administra roles ve «Crear»', async () => {
    serve(DIRECTOR_PERMISSIONS);
    renderWithApi(
      <Screen>
        <RoleList />
      </Screen>,
    );
    expect(await screen.findByRole('link', { name: 'Comercial' })).toBeVisible();
    expect(screen.getAllByText('Del sistema')).toHaveLength(2);
    expect(screen.queryByRole('link', { name: 'Crear un rol personalizado' })).toBeNull();
  });

  it('un rol del sistema se ve, pero no se edita', async () => {
    serve(ADMIN_PERMISSIONS);
    renderWithApi(
      <Screen>
        <RoleDetailPanel id={ROLE_COMERCIAL} />
      </Screen>,
    );
    expect(await screen.findByText(/Los roles del sistema no se editan/)).toBeVisible();
    expect(screen.getByLabelText(/Ver prospectos/)).toBeDisabled();
    expect(screen.queryByRole('button', { name: 'Guardar cambios' })).toBeNull();
  });
});

describe('editar un rol personalizado', () => {
  it('guarda con la versión vista (If-Match) y «solo lo propio»', async () => {
    const sent = serve(ADMIN_PERMISSIONS, {
      [`PATCH /v1/roles/${ROLE_CUSTOM}`]: () => json({ ...CUSTOM_DETAIL, version: 5 }),
    });
    renderWithApi(
      <Screen>
        <RoleDetailPanel id={ROLE_CUSTOM} />
      </Screen>,
    );
    await userEvent.click(await screen.findByLabelText(/Ver prospectos/));
    await userEvent.click(screen.getByRole('button', { name: 'Guardar cambios' }));
    expect(await screen.findByText('Guardamos los cambios del rol.')).toBeVisible();
    const patch = sent.find((request) => request.method === 'PATCH');
    expect(patch?.headers['If-Match']).toBe('"4"');
    expect(patch?.body).toEqual({
      name: 'Apoyo comercial',
      description: null,
      permissions: [
        { code: 'service.ticket.read', scope: 'own' },
        { code: 'crm.lead.read', scope: 'all' },
      ],
    });
  });

  it('si otra persona lo cambió antes, lo dice', async () => {
    serve(ADMIN_PERMISSIONS, {
      [`PATCH /v1/roles/${ROLE_CUSTOM}`]: () =>
        apiError(409, 'VERSION_CONFLICT', 'Otra persona cambió este registro.'),
    });
    renderWithApi(
      <Screen>
        <RoleDetailPanel id={ROLE_CUSTOM} />
      </Screen>,
    );
    const scope = await screen.findByLabelText('Alcance de «Ver tiquetes»');
    await userEvent.selectOptions(scope, 'all');
    await userEvent.click(screen.getByRole('button', { name: 'Guardar cambios' }));
    expect(await screen.findByText('Otra persona cambió este registro.')).toBeVisible();
  });
});

describe('crear un rol personalizado', () => {
  it('exige nombre y algún permiso, y al crear abre su ficha', async () => {
    const sent = serve(ADMIN_PERMISSIONS, {
      'POST /v1/roles': () => json({ id: ROLE_CUSTOM }, 201),
    });
    renderWithApi(
      <Screen>
        <RoleCreatePanel />
      </Screen>,
    );
    await userEvent.click(await screen.findByRole('button', { name: 'Crear el rol' }));
    expect(screen.getByText('Escriba un nombre de al menos 3 caracteres.')).toBeVisible();
    expect(screen.getByRole('alert')).toHaveTextContent('Elija al menos un permiso.');
    await userEvent.type(screen.getByLabelText('Nombre'), 'Apoyo comercial');
    await userEvent.click(screen.getByLabelText(/Ver prospectos/));
    await userEvent.click(screen.getByRole('button', { name: 'Crear el rol' }));
    await vi.waitFor(() => {
      expect(push).toHaveBeenCalledWith(`/app/administracion/roles/${ROLE_CUSTOM}`);
    });
    expect(sent.find((request) => request.method === 'POST')?.body).toMatchObject({
      name: 'Apoyo comercial',
      audience: 'internal',
      permissions: [{ code: 'crm.lead.read', scope: 'all' }],
    });
  });

  it('un rol del portal solo ofrece permisos del portal', async () => {
    serve(ADMIN_PERMISSIONS);
    renderWithApi(
      <Screen>
        <RoleCreatePanel />
      </Screen>,
    );
    await userEvent.selectOptions(await screen.findByLabelText('Para quién es'), 'portal');
    const picker = screen.getByText(/Portal del cliente \(M09\)/).closest('details');
    if (picker === null) throw new Error('Falta el grupo del portal');
    expect(within(picker).getByLabelText(/Ver facturas/)).toBeInTheDocument();
    expect(screen.queryByText(/Comercial \(M05\)/)).toBeNull();
  });
});

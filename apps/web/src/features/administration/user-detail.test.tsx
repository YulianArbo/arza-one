import { fireEvent, screen, within } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import type { JSX } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  ADMIN_PERMISSIONS,
  ASSIGNMENT_ID,
  DIRECTOR_PERMISSIONS,
  LUIS_ID,
  ME_ID,
  ROLES,
  detail,
} from '../../test-support/admin-fixtures';
import { POSITIONS, POS_MANAGER } from '../../test-support/core-fixtures';
import {
  SESSION,
  apiError,
  json,
  mockApi,
  noContent,
  renderWithApi,
  type SentRequest,
} from '../../test-support/fake-api';
import { RequireSession } from '../session/session-provider';
import { UserDetailPanel } from './user-detail';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace: vi.fn(), push: vi.fn() }),
  usePathname: () => '/app/administracion/usuarios/x',
}));

function Screen({ id = LUIS_ID }: { readonly id?: string }): JSX.Element {
  return (
    <RequireSession kind="internal">
      <UserDetailPanel id={id} />
    </RequireSession>
  );
}

function serve(permissions: object, user: object, extra: Record<string, () => Response> = {}) {
  return mockApi({
    'GET /v1/auth/session': () => json(SESSION),
    'GET /v1/me/permissions': () => json(permissions),
    'GET /v1/roles': () => json(ROLES),
    'GET /v1/positions': () => json(POSITIONS),
    [`GET /v1/users/${LUIS_ID}`]: () => json(user),
    [`GET /v1/users/${ME_ID}`]: () => json(user),
    'GET /v1/me/mfa': () =>
      json({ enabled: true, required: true, confirmed_at: null, recovery_codes_remaining: 10 }),
    ...extra,
  });
}

async function confirm(button: string): Promise<void> {
  await userEvent.click(await screen.findByRole('button', { name: button }));
  const dialog = await screen.findByRole('alertdialog');
  await userEvent.click(within(dialog).getByRole('button', { name: /^Sí,/ }));
}

beforeEach(() => {
  vi.stubGlobal('scrollTo', vi.fn());
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('ficha de usuario según quién la mira', () => {
  it('DIRECCION ve los datos y los roles, pero no los datos de seguridad ni las acciones', async () => {
    serve(DIRECTOR_PERMISSIONS, detail({ security: null }));
    renderWithApi(<Screen />);
    expect(await screen.findByRole('heading', { name: 'Luis Gómez' })).toBeVisible();
    expect(screen.getByRole('list', { name: 'Roles vigentes' })).toHaveTextContent(
      'asignó Ana Pérez',
    );
    expect(screen.queryByText('Segundo factor')).toBeNull();
    expect(screen.queryByRole('button', { name: 'Bloquear la cuenta' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Retirar' })).toBeNull();
  });

  it('el administrador ve el segundo factor, las sesiones y las acciones', async () => {
    serve(ADMIN_PERMISSIONS, detail());
    renderWithApi(<Screen />);
    expect(await screen.findByText('Configurado')).toBeVisible();
    expect(await screen.findByRole('button', { name: 'Bloquear la cuenta' })).toBeVisible();
    expect(screen.getByRole('button', { name: 'Reiniciar el segundo factor' })).toBeVisible();
    expect(screen.queryByRole('button', { name: 'Desbloquear la cuenta' })).toBeNull();
  });

  it('en su propia ficha no puede cambiar sus roles ni actuar sobre su cuenta', async () => {
    serve(ADMIN_PERMISSIONS, detail({ id: ME_ID }));
    renderWithApi(<Screen id={ME_ID} />);
    expect(
      await screen.findByText(/sus roles y su cargo los cambia otro administrador/),
    ).toBeVisible();
    expect(screen.queryByRole('button', { name: 'Retirar' })).toBeNull();
    expect(screen.queryByLabelText('Asignar un rol')).toBeNull();
    expect(screen.queryByLabelText('Cargo')).toBeNull();
    expect(screen.queryByRole('button', { name: 'Bloquear la cuenta' })).toBeNull();
  });

  it('una cuenta bloqueada ofrece desbloquear y una invitada, reenviar', async () => {
    serve(ADMIN_PERMISSIONS, detail({ status: 'locked' }));
    renderWithApi(<Screen />);
    expect(await screen.findByRole('button', { name: 'Desbloquear la cuenta' })).toBeVisible();
  });
});

describe('acciones sobre la cuenta', () => {
  it('bloquea después de confirmar y avisa', async () => {
    const sent = serve(ADMIN_PERMISSIONS, detail(), {
      [`POST /v1/users/${LUIS_ID}/actions/lock`]: () => noContent(),
    });
    renderWithApi(<Screen />);
    await confirm('Bloquear la cuenta');
    expect(await screen.findByText('Bloqueamos la cuenta de Luis Gómez.')).toBeVisible();
    expect(sent.some((request) => request.path.endsWith('/actions/lock'))).toBe(true);
  });

  it('si la API pide confirmar la identidad, abre la ventana y no muestra un error', async () => {
    serve(ADMIN_PERMISSIONS, detail(), {
      [`POST /v1/users/${LUIS_ID}/actions/reset-mfa`]: () =>
        apiError(403, 'REAUTHENTICATION_REQUIRED', 'Por seguridad, confirme que es usted.'),
    });
    renderWithApi(<Screen />);
    await confirm('Reiniciar el segundo factor');
    const dialog = await screen.findByRole('dialog', { name: 'Confirme que es usted' });
    expect(dialog).toHaveTextContent('cambia los accesos de otras personas');
    expect(screen.queryByText('No se pudo completar')).toBeNull();
  });

  it('muestra el error de la API', async () => {
    serve(ADMIN_PERMISSIONS, detail(), {
      [`POST /v1/users/${LUIS_ID}/actions/revoke-sessions`]: () =>
        apiError(404, 'USER_NOT_FOUND', 'El usuario no existe.'),
    });
    renderWithApi(<Screen />);
    await confirm('Cerrar sus sesiones');
    expect(await screen.findByText('El usuario no existe.')).toBeVisible();
  });
});

describe('roles de la persona', () => {
  it('asigna un rol con vencimiento al final del día en Colombia', async () => {
    const sent = serve(ADMIN_PERMISSIONS, detail(), {
      [`POST /v1/users/${LUIS_ID}/roles`]: () => json({ id: ASSIGNMENT_ID }, 201),
    });
    renderWithApi(<Screen />);
    const select = await screen.findByLabelText('Asignar un rol');
    await vi.waitFor(() => {
      expect(within(select).getByRole('option', { name: 'Apoyo comercial' })).toBeInTheDocument();
    });
    // Solo los roles internos que no tiene: ni Comercial ni el del portal.
    expect(within(select).queryByRole('option', { name: 'Comercial' })).toBeNull();
    expect(within(select).queryByRole('option', { name: 'Administrador del cliente' })).toBeNull();
    await userEvent.selectOptions(select, 'Apoyo comercial');
    fireEvent.change(screen.getByLabelText('Vence (opcional)'), {
      target: { value: '2026-12-31' },
    });
    await userEvent.click(screen.getByRole('button', { name: 'Asignar' }));
    await vi.waitFor(() => {
      const assign = sent.find((request) => request.method === 'POST');
      expect(assign?.body).toEqual({
        role_id: ROLES.data[1]?.['id'],
        valid_until: '2027-01-01T04:59:59.000Z',
      });
    });
  });

  it('retira un rol después de confirmar', async () => {
    const sent = serve(ADMIN_PERMISSIONS, detail(), {
      [`POST /v1/users/${LUIS_ID}/roles/${ASSIGNMENT_ID}/actions/revoke`]: () => noContent(),
    });
    renderWithApi(<Screen />);
    await confirm('Retirar');
    await vi.waitFor(() => {
      expect(sent.some((request) => request.path.endsWith('/actions/revoke'))).toBe(true);
    });
  });
});

const DIRECTOR_POSITION = POSITIONS.data[0]?.id;

function patches(sent: readonly SentRequest[]): SentRequest[] {
  return sent.filter((request) => request.method === 'PATCH');
}

describe('cargo de la persona: elegir y guardar', () => {
  it('ofrece los cargos activos y guarda el elegido con la versión que se vio', async () => {
    const sent = serve(ADMIN_PERMISSIONS, detail(), {
      [`PATCH /v1/users/${LUIS_ID}`]: () => noContent(),
    });
    renderWithApi(<Screen />);
    expect(await screen.findByText('Sin cargo', { selector: 'p *, p' })).toBeVisible();
    const select = await screen.findByLabelText('Cargo');
    await vi.waitFor(() => {
      expect(within(select).getByRole('option', { name: 'Director General' })).toBeInTheDocument();
    });
    expect(within(select).queryByRole('option', { name: /Gerente de Tecnología/ })).toBeNull();
    const save = screen.getByRole('button', { name: 'Guardar el cargo' });
    expect(save).toBeDisabled();
    await userEvent.selectOptions(select, 'Director General');
    await userEvent.click(save);
    expect(await screen.findByText('Guardamos el cargo.')).toBeVisible();
    const [patch] = patches(sent);
    expect(patch?.body).toEqual({ position_id: DIRECTOR_POSITION });
    expect(patch?.headers).toMatchObject({ 'If-Match': '"3"' });
  });

  it('muestra un cargo inactivo y permite quitarlo', async () => {
    const position = { id: POS_MANAGER, name: 'Gerente de Tecnología', is_active: false };
    const sent = serve(ADMIN_PERMISSIONS, detail({ position }), {
      [`PATCH /v1/users/${LUIS_ID}`]: () => noContent(),
    });
    renderWithApi(<Screen />);
    const select = await screen.findByLabelText('Cargo');
    expect(select).toHaveDisplayValue('Gerente de Tecnología (cargo inactivo)');
    await userEvent.selectOptions(select, 'Sin cargo');
    await userEvent.click(screen.getByRole('button', { name: 'Guardar el cargo' }));
    await vi.waitFor(() => {
      expect(patches(sent)[0]?.body).toEqual({ position_id: null });
    });
  });
});

describe('cargo de la persona: avisos y permisos', () => {
  it('si otra persona cambió la ficha, muestra el aviso de la API', async () => {
    serve(ADMIN_PERMISSIONS, detail(), {
      [`PATCH /v1/users/${LUIS_ID}`]: () =>
        apiError(409, 'VERSION_CONFLICT', 'Otra persona cambió este registro. Recargue.'),
    });
    renderWithApi(<Screen />);
    const select = await screen.findByLabelText('Cargo');
    await vi.waitFor(() => {
      expect(within(select).getByRole('option', { name: 'Director General' })).toBeInTheDocument();
    });
    await userEvent.selectOptions(select, 'Director General');
    await userEvent.click(screen.getByRole('button', { name: 'Guardar el cargo' }));
    expect(await screen.findByText('Otra persona cambió este registro. Recargue.')).toBeVisible();
  });

  it('quien solo lee usuarios ve el cargo, pero no lo cambia', async () => {
    const position = { id: DIRECTOR_POSITION, name: 'Director General', is_active: true };
    serve(DIRECTOR_PERMISSIONS, detail({ security: null, position }));
    renderWithApi(<Screen />);
    expect(await screen.findByText('Director General')).toBeVisible();
    expect(screen.queryByLabelText('Cargo')).toBeNull();
  });

  it('las cuentas del portal no tienen cargo', async () => {
    serve(ADMIN_PERMISSIONS, detail({ kind: 'portal' }));
    renderWithApi(<Screen />);
    expect(await screen.findByRole('heading', { name: 'Luis Gómez' })).toBeVisible();
    expect(screen.queryByText(/Cargo actual/)).toBeNull();
  });
});

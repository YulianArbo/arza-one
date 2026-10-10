import { fireEvent, screen, within } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import type { JSX, ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  ADMIN_PERMISSIONS,
  DIRECTOR_PERMISSIONS,
  LUIS_ID,
  ME_ID,
  WORKER_PERMISSIONS,
  summary,
} from '../../test-support/admin-fixtures';
import { SESSION, json, mockApi, noContent, renderWithApi } from '../../test-support/fake-api';
import { RequireSession } from '../session/session-provider';
import { AccessReviewPanel } from './access-review';
import { DelegationsPanel } from './delegations-panel';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace: vi.fn(), push: vi.fn() }),
  usePathname: () => '/app/administracion/delegaciones',
}));

const DELEGATION_ID = '01999a00-0000-7000-8000-00000000f001';
const ANA = { id: ME_ID, email: 'ana@demo-uno.test', display_name: 'Ana Pérez' };
const LUIS = { id: LUIS_ID, email: 'luis@demo-uno.test', display_name: 'Luis Gómez' };

function delegation(overrides: Record<string, unknown> = {}) {
  return {
    id: DELEGATION_ID,
    from_user: ANA,
    to_user: LUIS,
    starts_at: '2026-10-10T05:00:00.000Z',
    ends_at: '2026-10-20T04:59:59.000Z',
    permissions: ['finance.expense.approve'],
    reason: 'Vacaciones',
    status: 'active',
    created_at: '2026-10-09T15:00:00.000Z',
    ...overrides,
  };
}

function Screen({ children }: { readonly children: ReactNode }): JSX.Element {
  return <RequireSession kind="internal">{children}</RequireSession>;
}

function serve(permissions: object, extra: Record<string, () => Response> = {}) {
  return mockApi({
    'GET /v1/auth/session': () => json(SESSION),
    'GET /v1/me/permissions': () => json(permissions),
    'GET /v1/delegations': () => json({ data: [delegation()] }),
    'GET /v1/users': () => json({ data: [summary()], next_cursor: null }),
    ...extra,
  });
}

beforeEach(() => {
  vi.stubGlobal('scrollTo', vi.fn());
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('delegaciones de un colaborador', () => {
  it('delega por correo solo sus propias aprobaciones', async () => {
    const sent = serve(WORKER_PERMISSIONS, {
      'POST /v1/delegations': () => json({ id: DELEGATION_ID }, 201),
    });
    renderWithApi(
      <Screen>
        <DelegationsPanel />
      </Screen>,
    );
    await userEvent.type(
      await screen.findByLabelText('Correo de quien recibe'),
      'luis@demo-uno.test',
    );
    fireEvent.change(screen.getByLabelText('Desde'), { target: { value: '2026-10-10' } });
    fireEvent.change(screen.getByLabelText('Hasta (máximo 60 días)'), {
      target: { value: '2026-10-19' },
    });
    await userEvent.type(screen.getByLabelText('Motivo'), 'Vacaciones');
    await userEvent.click(screen.getByLabelText('Aprobar gastos'));
    expect(screen.queryByLabelText('Aprobar facturas')).toBeNull();
    await userEvent.click(screen.getByRole('button', { name: 'Delegar' }));
    expect(await screen.findByText('Registramos la delegación.')).toBeVisible();
    expect(sent.find((request) => request.method === 'POST')?.body).toEqual({
      to_email: 'luis@demo-uno.test',
      starts_at: '2026-10-10T05:00:00.000Z',
      ends_at: '2026-10-20T04:59:59.000Z',
      reason: 'Vacaciones',
      permissions: ['finance.expense.approve'],
    });
  });
});

describe('retirar delegaciones', () => {
  it('retira la que hizo, después de confirmar', async () => {
    const sent = serve(WORKER_PERMISSIONS, {
      [`POST /v1/delegations/${DELEGATION_ID}/actions/revoke`]: () => noContent(),
    });
    renderWithApi(
      <Screen>
        <DelegationsPanel />
      </Screen>,
    );
    await userEvent.click(await screen.findByRole('button', { name: 'Retirar' }));
    await userEvent.click(
      within(await screen.findByRole('alertdialog')).getByRole('button', { name: 'Sí, retirar' }),
    );
    await vi.waitFor(() => {
      expect(sent.some((request) => request.path.endsWith('/actions/revoke'))).toBe(true);
    });
  });
});

describe('delegaciones recibidas', () => {
  it('no ofrece retirar la que recibió, y sin aprobaciones lo explica', async () => {
    serve(
      { roles: [], permissions: [{ code: 'iam.delegation.manage', scope: 'own' }] },
      {
        'GET /v1/delegations': () =>
          json({ data: [delegation({ from_user: LUIS, to_user: ANA })] }),
      },
    );
    renderWithApi(
      <Screen>
        <DelegationsPanel />
      </Screen>,
    );
    expect(await screen.findByText('Usted no tiene aprobaciones que delegar.')).toBeVisible();
    expect(await screen.findByText('Vigente')).toBeVisible();
    expect(screen.queryByRole('button', { name: 'Retirar' })).toBeNull();
  });
});

describe('delegaciones del administrador', () => {
  it('elige de la lista quién delega y a quién', async () => {
    serve(ADMIN_PERMISSIONS, { 'GET /v1/delegations': () => json({ data: [] }) });
    renderWithApi(
      <Screen>
        <DelegationsPanel />
      </Screen>,
    );
    expect(await screen.findByText('Todavía no hay delegaciones')).toBeVisible();
    const from = screen.getByLabelText('Quién delega');
    await vi.waitFor(() => {
      expect(within(from).getByRole('option', { name: 'Luis Gómez' })).toBeInTheDocument();
    });
    await userEvent.selectOptions(from, 'Luis Gómez');
    expect(screen.getByLabelText('Aprobar facturas')).toBeVisible();
  });
});

describe('informe de revisión de accesos', () => {
  it('muestra los totales, marca las cuentas sin uso y permite imprimir', async () => {
    const print = vi.fn();
    vi.stubGlobal('print', print);
    serve(DIRECTOR_PERMISSIONS, {
      'GET /v1/access-review': () =>
        json({
          generated_at: '2026-10-09T15:00:00.000Z',
          unused_days: 60,
          totals: { users: 2, active: 2, unused: 1, without_roles: 1 },
          users: [
            { ...summary(), unused: true },
            { ...summary({ id: ME_ID, roles: [] }), unused: false },
          ],
        }),
    });
    renderWithApi(
      <Screen>
        <AccessReviewPanel />
      </Screen>,
    );
    expect(await screen.findByText('Sin uso en 60 días')).toBeVisible();
    expect(screen.getByText('Sin uso', { selector: 'span' })).toBeVisible();
    expect(screen.getByText('Sin roles', { selector: 'td' })).toBeVisible();
    await userEvent.click(screen.getByRole('button', { name: 'Imprimir o guardar en PDF' }));
    expect(print).toHaveBeenCalled();
  });
});

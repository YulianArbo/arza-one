import type { PermissionCode } from '@arza/contracts';
import { screen, within } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import type { JSX, ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { LUIS_ID, ME_ID } from '../../test-support/admin-fixtures';
import { SESSION, json, mockApi, renderWithApi } from '../../test-support/fake-api';
import { RequireSession } from '../session/session-provider';
import { AuditEvents } from './audit-events';
import { ChainVerificationPanel } from './chain-verification';
import { EntityHistory } from './entity-history';
import { changesSummary } from './labels';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace: vi.fn(), push: vi.fn() }),
  usePathname: () => '/app/auditoria',
}));

const EVENT = {
  id: '01999a00-0000-7000-8000-00000000e101',
  seq: 42,
  occurred_at: '2026-10-09T20:15:00.000Z',
  actor: { kind: 'user', id: ME_ID, email: 'ana@demo-uno.test', display_name: 'Ana Pérez' },
  action: 'iam.role.update',
  entity_type: 'iam_role',
  entity_id: '01999a00-0000-7000-8000-00000000c002',
  result: 'success',
  changes: { name: { from: 'Apoyo', to: 'Apoyo comercial' } },
  ip: '203.0.113.7',
  correlation_id: null,
  hash: 'a'.repeat(64),
};

function permissions(codes: readonly PermissionCode[]) {
  return { roles: [], permissions: codes.map((code) => ({ code, scope: 'all' })) };
}

function serve(codes: readonly PermissionCode[], extra: Record<string, () => Response> = {}) {
  return mockApi({
    'GET /v1/auth/session': () => json(SESSION),
    'GET /v1/me/permissions': () => json(permissions(codes)),
    'GET /v1/audit-events': () => json({ data: [EVENT], next_cursor: null }),
    ...extra,
  });
}

function Screen({ children }: { readonly children: ReactNode }): JSX.Element {
  return <RequireSession kind="internal">{children}</RequireSession>;
}

beforeEach(() => {
  vi.stubGlobal('scrollTo', vi.fn());
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('consulta de eventos', () => {
  it('muestra quién hizo qué, cuándo y qué cambió, en palabras', async () => {
    serve(['audit.event.read']);
    renderWithApi(
      <Screen>
        <AuditEvents />
      </Screen>,
    );
    const row = (await screen.findByText('Editó un rol')).closest('tr');
    expect(row).not.toBeNull();
    const cells = within(row ?? document.body);
    expect(cells.getByText('Ana Pérez')).toBeInTheDocument();
    expect(cells.getByText('09/10/2026, 3:15 p. m.')).toBeInTheDocument();
    expect(cells.getByText('name: Apoyo → Apoyo comercial')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Exportar a CSV' })).not.toBeInTheDocument();
  });

  it('envía los filtros, con las fechas en hora de Colombia', async () => {
    const sent = serve(['audit.event.read']);
    renderWithApi(
      <Screen>
        <AuditEvents />
      </Screen>,
    );
    await userEvent.type(await screen.findByLabelText('Desde'), '2026-10-01');
    await userEvent.type(screen.getByLabelText('Hasta'), '2026-10-09');
    await userEvent.type(screen.getByLabelText('Acción'), 'iam.role');
    await userEvent.click(screen.getByRole('button', { name: 'Buscar' }));
    await vi.waitFor(() => {
      const search = sent.filter((request) => request.path === '/v1/audit-events').at(-1)?.search;
      expect(Object.fromEntries(new URLSearchParams(search))).toEqual({
        limit: '25',
        from: '2026-10-01T05:00:00.000Z',
        to: '2026-10-10T05:00:00.000Z',
        action: 'iam.role',
      });
    });
  });
});

describe('exportación de la auditoría', () => {
  it('el auditor exporta con los mismos filtros y descarga el archivo', async () => {
    const createObjectURL = vi.fn(() => 'blob:auditoria');
    vi.stubGlobal('URL', Object.assign(URL, { createObjectURL, revokeObjectURL: vi.fn() }));
    const csv = new Response('posicion\r\n42\r\n', {
      headers: { 'Content-Disposition': 'attachment; filename="auditoria-2026-10-09T2015Z.csv"' },
    });
    const sent = serve(['audit.event.read', 'audit.event.export'], {
      'POST /v1/audit-exports': () => csv,
    });
    renderWithApi(
      <Screen>
        <AuditEvents />
      </Screen>,
    );
    await userEvent.click(await screen.findByRole('button', { name: 'Exportar a CSV' }));
    expect(
      await screen.findByText('Descargamos el archivo auditoria-2026-10-09T2015Z.csv.'),
    ).toBeInTheDocument();
    expect(sent.find((request) => request.method === 'POST')?.body).toEqual({});
    expect(createObjectURL).toHaveBeenCalledOnce();
  });
});

describe('historial de un registro', () => {
  it('no se muestra a quien no puede leer la auditoría', async () => {
    serve(['iam.user.read']);
    renderWithApi(
      <Screen>
        <p>Ficha</p>
        <EntityHistory entityType="iam_user" entityId={LUIS_ID} />
      </Screen>,
    );
    await screen.findByText('Ficha');
    expect(screen.queryByText('Historial')).not.toBeInTheDocument();
  });

  it('pide el historial del registro y lo muestra', async () => {
    serve(['audit.event.read'], {
      [`GET /v1/entities/iam_user/${LUIS_ID}/history`]: () =>
        json({ data: [EVENT], next_cursor: null }),
    });
    renderWithApi(
      <Screen>
        <EntityHistory entityType="iam_user" entityId={LUIS_ID} />
      </Screen>,
    );
    expect(await screen.findByText('Editó un rol')).toBeInTheDocument();
    expect(screen.getByText('Historial')).toBeInTheDocument();
  });
});

describe('verificación de integridad', () => {
  function verifyWith(result: object) {
    serve(['audit.chain.verify'], {
      'POST /v1/audit-events/verify-chain': () =>
        json({ checked: 1200, verified_at: '2026-10-09T20:15:00.000Z', ...result }),
    });
    renderWithApi(
      <Screen>
        <ChainVerificationPanel />
      </Screen>,
    );
  }

  it('dice que la auditoría está íntegra', async () => {
    verifyWith({ intact: true, broken_seq: null, problem: null });
    await userEvent.click(await screen.findByRole('button', { name: 'Verificar ahora' }));
    expect(await screen.findByText('La auditoría está íntegra')).toBeInTheDocument();
    expect(screen.getByText(/Revisamos 1\.200 eventos/)).toBeInTheDocument();
  });

  it('avisa qué evento se alteró', async () => {
    verifyWith({ intact: false, broken_seq: 7, problem: 'altered' });
    await userEvent.click(await screen.findByRole('button', { name: 'Verificar ahora' }));
    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('Un evento fue modificado después de registrarse.');
    expect(alert).toHaveTextContent('número 7');
  });
});

describe('resumen de los cambios', () => {
  it('dice el valor anterior y el nuevo, y de lo restringido solo que cambió', () => {
    expect(
      changesSummary({ name: { from: null, to: 'Ventas' }, account: { changed: true }, n: 2 }),
    ).toBe('name: vacío → Ventas · account: cambió · n: 2');
    expect(changesSummary({})).toBe('—');
  });
});

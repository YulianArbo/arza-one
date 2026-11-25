import { screen, within } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import type { JSX } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { ME_ID } from '../../test-support/admin-fixtures';
import { SESSION, json, mockApi, renderWithApi } from '../../test-support/fake-api';
import { RequireSession } from '../session/session-provider';
import { SecurityEvents } from './security-events';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace: vi.fn(), push: vi.fn() }),
  usePathname: () => '/app/auditoria/seguridad',
}));

const LOCKED = {
  id: '01999a00-0000-7000-8000-00000000f101',
  occurred_at: '2026-10-09T20:15:00.000Z',
  type: 'iam.account.locked',
  severity: 'high',
  user: { id: ME_ID, email: 'ana@demo-uno.test', display_name: null },
  ip: '203.0.113.7',
  detail: {},
};

const UNKNOWN = {
  ...LOCKED,
  id: '01999a00-0000-7000-8000-00000000f102',
  type: 'iam.algo.nuevo',
  severity: 'low',
  user: null,
  ip: null,
};

function serve(events: readonly unknown[]) {
  return mockApi({
    'GET /v1/auth/session': () => json(SESSION),
    'GET /v1/me/permissions': () =>
      json({ roles: [], permissions: [{ code: 'audit.security.read', scope: 'all' }] }),
    'GET /v1/security-events': () => json({ data: events, next_cursor: null }),
  });
}

function Screen(): JSX.Element {
  return (
    <RequireSession kind="internal">
      <SecurityEvents />
    </RequireSession>
  );
}

beforeEach(() => {
  vi.stubGlobal('scrollTo', vi.fn());
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('eventos de seguridad', () => {
  it('dice qué pasó, a quién y desde dónde; lo desconocido se muestra tal cual', async () => {
    serve([LOCKED, UNKNOWN]);
    renderWithApi(<Screen />);
    const locked = within(
      (await screen.findByText('Cuenta bloqueada por intentos fallidos')).closest('tr') ??
        document.body,
    );
    expect(locked.getByText('Alta')).toBeInTheDocument();
    expect(locked.getByText('ana@demo-uno.test')).toBeInTheDocument();
    expect(locked.getByText('Desde 203.0.113.7')).toBeInTheDocument();
    const unknown = within(
      screen.getAllByText('iam.algo.nuevo')[0]?.closest('tr') ?? document.body,
    );
    // Sin persona y sin detalle: un guion en cada celda.
    expect(unknown.getAllByText('—')).toHaveLength(2);
    expect(unknown.queryByText(/^Desde/)).toBeNull();
  });

  it('filtra por gravedad y explica cuando no hay eventos', async () => {
    const sent = serve([]);
    renderWithApi(<Screen />);
    expect(await screen.findByText('No hay eventos de seguridad')).toBeVisible();
    await userEvent.selectOptions(screen.getByLabelText('Gravedad'), 'critical');
    await vi.waitFor(() => {
      const search = sent
        .filter((request) => request.path === '/v1/security-events')
        .at(-1)?.search;
      expect(new URLSearchParams(search).get('severity')).toBe('critical');
    });
  });
});

describe('alertas de B44', () => {
  it('nombra en español el ingreso de un administrador y la exportación masiva', async () => {
    const admin = {
      ...LOCKED,
      id: '01999a00-0000-7000-8000-00000000f103',
      type: 'iam.login.admin',
    };
    const bulk = {
      ...LOCKED,
      id: '01999a00-0000-7000-8000-00000000f104',
      type: 'data.export.bulk',
    };
    serve([admin, bulk]);
    renderWithApi(<Screen />);
    expect(
      await screen.findByText('Inició sesión un administrador de la plataforma'),
    ).toBeInTheDocument();
    expect(screen.getByText('Exportación masiva de datos')).toBeInTheDocument();
  });
});

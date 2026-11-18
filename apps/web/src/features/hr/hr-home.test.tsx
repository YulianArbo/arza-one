import { screen } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';

import { Screen } from '../../test-support/core-fixtures';
import { json, mockApi, renderWithApi, SESSION } from '../../test-support/fake-api';
import { permissionsOf } from '../../test-support/party-fixtures';
import { HrHome } from './hr-home';

vi.mock('next/navigation', () => ({
  usePathname: () => '/app/talento-y-sst',
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
}));
afterEach(() => vi.unstubAllGlobals());

it('muestra la ficha propia sin consultar vacantes ni candidaturas', async () => {
  const id = '01999a00-0000-7000-8000-0000000fd101';
  const requests = mockApi({
    'GET /v1/auth/session': () => json(SESSION),
    'GET /v1/me/permissions': () => json(permissionsOf(['hr.employee.read'])),
    'GET /v1/hr/employees': () =>
      json({
        data: [
          {
            id,
            name: 'Ana Prueba',
            position: { id, name: 'Analista' },
            hire_date: '2026-11-15',
            contract_type: 'indefinite',
            work_mode: 'on_site',
            status: 'active',
            user_id: id,
            candidate_id: null,
            version: 1,
          },
        ],
      }),
  });
  renderWithApi(
    <Screen>
      <HrHome />
    </Screen>,
  );
  expect(await screen.findByRole('link', { name: 'Ana Prueba' })).toHaveAttribute(
    'href',
    `/app/talento-y-sst/colaboradores/${id}`,
  );
  expect(screen.queryByRole('heading', { name: 'Vacantes' })).not.toBeInTheDocument();
  expect(screen.queryByRole('heading', { name: 'Candidaturas' })).not.toBeInTheDocument();
  expect(requests.map(({ path }) => path)).not.toContain('/v1/hr/candidates');
});

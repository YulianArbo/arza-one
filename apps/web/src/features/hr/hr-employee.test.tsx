import type { EmployeeDetail, PermissionCode } from '@arza/contracts';
import { screen, within } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

import { Screen } from '../../test-support/core-fixtures';
import {
  SESSION,
  json,
  mockApi,
  noContent,
  renderWithApi,
  type SentRequest,
} from '../../test-support/fake-api';
import { permissionsOf } from '../../test-support/party-fixtures';
import { EmployeePanel } from './employee-panel';
import { EMPLOYEE_ID, employeeDetail } from './hr-fixtures';

// Ficha del colaborador (B35): contrato laboral, firma de la Dirección, vinculación, anulación e
// inducción con su responsable. El salario exacto solo llega a quien puede verlo.

vi.mock('next/navigation', () => ({
  usePathname: () => `/app/talento-y-sst/colaboradores/${EMPLOYEE_ID}`,
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
}));

const PATH = `/v1/hr/employees/${EMPLOYEE_ID}`;
const HR: readonly PermissionCode[] = ['hr.employee.read', 'hr.employee.manage', 'hr.file.read'];

function serve(
  record: EmployeeDetail,
  permissions: readonly PermissionCode[],
  extra: object = {},
): SentRequest[] {
  return mockApi({
    'GET /v1/auth/session': () => json(SESSION),
    'GET /v1/me/permissions': () => json(permissionsOf(permissions)),
    [`GET ${PATH}`]: () => json(record),
    ...extra,
  });
}

function show(): void {
  renderWithApi(
    <Screen>
      <EmployeePanel id={EMPLOYEE_ID} />
    </Screen>,
  );
}

function sentTo(sent: readonly SentRequest[], ending: string): SentRequest | undefined {
  return sent.find((request) => request.method !== 'GET' && request.path.endsWith(ending));
}

beforeEach(() => {
  vi.stubGlobal('scrollTo', vi.fn());
});

afterEach(() => {
  vi.unstubAllGlobals();
});

it('con el contrato firmado, Talento humano vincula con la versión que vio', async () => {
  const sent = serve(employeeDetail(), HR, {
    [`POST ${PATH}/actions/activate`]: () => noContent(),
  });
  show();
  expect(await screen.findByText(/Banda salarial Banda 2/)).toHaveTextContent('3.500.000');
  await userEvent.click(await screen.findByRole('button', { name: 'Vincular colaborador' }));
  await vi.waitFor(() => {
    expect(sentTo(sent, '/actions/activate')?.headers['If-Match']).toBe('"4"');
  });
});

it('sin permiso de salarios no muestra el valor exacto ni las acciones', async () => {
  const record = employeeDetail({ contract: { salary: null, document_available: false } });
  serve(record, ['hr.employee.read']);
  show();
  expect(await screen.findByText('Banda salarial Banda 2')).toBeInTheDocument();
  expect(screen.queryByRole('button', { name: 'Vincular colaborador' })).not.toBeInTheDocument();
  expect(screen.queryByRole('button', { name: 'Abrir contrato' })).not.toBeInTheDocument();
});

it('la Dirección firma por la empresa cuando le toca', async () => {
  const record = employeeDetail({ contract: { status: 'in_signature', my_turn: true } });
  const sent = serve(record, ['hr.employee.read'], {
    [`POST ${PATH}/contract/actions/sign`]: () => noContent(),
  });
  show();
  await userEvent.click(
    await screen.findByRole('button', { name: 'Confirmar y firmar por la empresa' }),
  );
  await vi.waitFor(() => {
    expect(sentTo(sent, '/contract/actions/sign')?.body).toEqual({ accept: true });
  });
});

it('anula una vinculación en firma con su motivo', async () => {
  const record = employeeDetail({ contract: { status: 'in_signature' } });
  const sent = serve(record, HR, { [`POST ${PATH}/actions/cancel-hiring`]: () => noContent() });
  show();
  await userEvent.click(await screen.findByRole('button', { name: 'Anular vinculación' }));
  const dialog = await screen.findByRole('dialog');
  await userEvent.type(within(dialog).getByLabelText('Motivo'), 'Desistió del cargo');
  await userEvent.click(within(dialog).getByRole('button', { name: 'Anular vinculación' }));
  await vi.waitFor(() => {
    expect(sentTo(sent, '/actions/cancel-hiring')?.body).toEqual({
      reason: 'Desistió del cargo',
    });
  });
});

it('muestra cada tarea de inducción con su responsable', async () => {
  const record: EmployeeDetail = {
    ...employeeDetail({ status: 'active' }),
    onboarding: [
      {
        id: '01999a00-0000-7000-8000-0000000fd301',
        employee: { id: EMPLOYEE_ID, name: 'Ana Prueba' },
        kind: 'medical_exam',
        title: 'Evaluación médica ocupacional de ingreso',
        responsible: { id: '01999a00-0000-7000-8000-0000000fd302', name: 'Líder SST' },
        due_on: '2026-12-01',
        done_on: null,
        note: null,
        version: 1,
      },
    ],
  };
  serve(record, HR);
  show();
  expect(await screen.findByText(/Responsable: Líder SST/)).toHaveTextContent('01/12/2026');
});

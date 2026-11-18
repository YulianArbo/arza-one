import type { EmployeeDetail, PermissionCode } from '@arza/contracts';
import { screen, within } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

import { Screen } from '../../test-support/core-fixtures';
import {
  SESSION,
  json,
  mockApi,
  renderWithApi,
  type SentRequest,
} from '../../test-support/fake-api';
import { permissionsOf } from '../../test-support/party-fixtures';
import { EmployeePanel } from './employee-panel';
import { CANDIDATE, CANDIDATE_ID, EMPLOYEE_ID, employeeDetail } from './hr-fixtures';
import { HrHome } from './hr-home';

// Estados de las pantallas de Talento humano (B35): listas vacías, la ficha sin contrato ni
// historia, una tarea ya realizada, el enlace a la ficha que nació de una candidatura y el registro
// de una evaluación con su puntaje.

vi.mock('next/navigation', () => ({
  usePathname: () => '/app/talento-y-sst',
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
}));

const HR: readonly PermissionCode[] = [
  'hr.vacancy.manage',
  'hr.candidate.manage',
  'hr.employee.read',
  'hr.employee.manage',
];

function serve(routes: object): SentRequest[] {
  return mockApi({
    'GET /v1/auth/session': () => json(SESSION),
    'GET /v1/me/permissions': () => json(permissionsOf(HR)),
    ...routes,
  });
}

function home(): void {
  renderWithApi(
    <Screen>
      <HrHome />
    </Screen>,
  );
}

beforeEach(() => {
  vi.stubGlobal('scrollTo', vi.fn());
});

afterEach(() => {
  vi.unstubAllGlobals();
});

it('explica cuando no hay vacantes, candidaturas ni colaboradores', async () => {
  serve({
    'GET /v1/hr/vacancies': () => json({ data: [] }),
    'GET /v1/hr/candidates': () => json({ data: [] }),
    'GET /v1/hr/employees': () => json({ data: [] }),
  });
  home();
  expect(await screen.findByText('No hay vacantes registradas.')).toBeInTheDocument();
  expect(await screen.findByText('No hay candidaturas registradas.')).toBeInTheDocument();
  expect(await screen.findByText('No hay colaboradores visibles.')).toBeInTheDocument();
});

it('lleva a la ficha laboral de la candidatura que ya tiene colaborador', async () => {
  serve({
    'GET /v1/hr/vacancies': () => json({ data: [] }),
    'GET /v1/hr/candidates': () =>
      json({ data: [{ ...CANDIDATE, stage: 'selected', employee_id: EMPLOYEE_ID }] }),
    'GET /v1/hr/employees': () => json({ data: [] }),
  });
  home();
  expect(await screen.findByRole('link', { name: 'Abrir ficha laboral' })).toHaveAttribute(
    'href',
    `/app/talento-y-sst/colaboradores/${EMPLOYEE_ID}`,
  );
});

it('registra una evaluación con su puntaje y sin observación', async () => {
  const sent = serve({
    'GET /v1/hr/vacancies': () => json({ data: [] }),
    'GET /v1/hr/candidates': () => json({ data: [{ ...CANDIDATE, stage: 'evaluating' }] }),
    'GET /v1/hr/employees': () => json({ data: [] }),
    [`POST /v1/hr/candidates/${CANDIDATE_ID}/evaluations`]: () =>
      json({ id: '01999a00-0000-7000-8000-0000000fd501' }, 201),
  });
  home();
  await userEvent.click(await screen.findByRole('button', { name: 'Evaluar' }));
  const dialog = await screen.findByRole('dialog');
  await userEvent.selectOptions(within(dialog).getByLabelText('Tipo'), 'interview');
  await userEvent.type(within(dialog).getByLabelText('Puntaje de 0 a 100'), '80');
  await userEvent.click(within(dialog).getByRole('button', { name: 'Guardar evaluación' }));
  await vi.waitFor(() => {
    const request = sent.find(({ method }) => method === 'POST');
    expect(request?.body).toMatchObject({ kind: 'interview', score: 80, note: null });
  });
});

it('muestra la ficha sin contrato ni historia laboral y la tarea ya realizada', async () => {
  const record: EmployeeDetail = {
    ...employeeDetail({ status: 'active' }),
    email: null,
    contract: null,
    file: null,
    onboarding: [
      {
        id: '01999a00-0000-7000-8000-0000000fd502',
        employee: { id: EMPLOYEE_ID, name: 'Ana Prueba' },
        kind: 'induction',
        title: 'Inducción institucional',
        responsible: null,
        due_on: '2026-12-06',
        done_on: '2026-12-04',
        note: null,
        version: 2,
      },
    ],
  };
  serve({ [`GET /v1/hr/employees/${EMPLOYEE_ID}`]: () => json(record) });
  renderWithApi(
    <Screen>
      <EmployeePanel id={EMPLOYEE_ID} />
    </Screen>,
  );
  expect(await screen.findByText('Realizada el 04/12/2026')).toBeInTheDocument();
  expect(screen.queryByRole('heading', { name: 'Contrato laboral' })).not.toBeInTheDocument();
  expect(screen.queryByRole('heading', { name: 'Historia laboral' })).not.toBeInTheDocument();
  expect(
    screen.queryByRole('button', { name: 'Completar Inducción institucional' }),
  ).not.toBeInTheDocument();
});

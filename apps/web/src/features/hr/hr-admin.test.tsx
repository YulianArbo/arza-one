import type { PermissionCode } from '@arza/contracts';
import { screen, within } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import type { ReactNode } from 'react';
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
import { AbsencesAdmin } from './hr-admin-absences';
import { DevelopmentAdmin } from './hr-admin-development';
import { DisciplineAdmin } from './hr-admin-discipline';
import { OffboardingAdmin } from './hr-admin-offboarding';
import { PayrollAdmin } from './hr-admin-payroll';
import {
  B36_ID,
  LEAVE,
  NOVELTY,
  OFFBOARDING,
  OPEN_PERIOD,
  OVERTIME,
  REVIEW,
  TRAINING,
} from './hr-b36-fixtures';

// Pantallas de Talento humano del B36: ausencias de la empresa, novedades por mes con su cierre,
// desempeño y formación, procesos disciplinarios y retiros con su paz y salvo.

vi.mock('next/navigation', () => ({
  usePathname: () => '/app/talento-y-sst',
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
}));

beforeEach(() => {
  vi.stubGlobal('scrollTo', vi.fn());
});
afterEach(() => vi.unstubAllGlobals());

const HR: readonly PermissionCode[] = [
  'hr.employee.read',
  'hr.employee.manage',
  'hr.leave.approve',
  'hr.overtime.authorize',
  'hr.payroll_novelty.manage',
  'hr.payroll_novelty.close',
  'hr.performance.manage',
  'hr.training.manage',
  'hr.disciplinary.manage',
  'hr.offboarding.manage',
];

const EMPLOYEES = {
  data: [
    {
      id: B36_ID(1),
      name: 'Ana Prueba',
      position: { id: B36_ID(3), name: 'Analista' },
      hire_date: '2025-11-19',
      contract_type: 'indefinite',
      work_mode: 'on_site',
      status: 'active',
      user_id: B36_ID(1),
      candidate_id: null,
      version: 2,
    },
  ],
};

const CASE = {
  id: B36_ID(50),
  code: 'DIS-2026-0001',
  employee: { id: B36_ID(1), name: 'Ana Prueba' },
  status: 'opened',
  opened_on: '2026-11-18',
  hearing_on: null,
  decided_on: null,
  decision: null,
  version: 1,
};

const CASE_DETAIL = {
  ...CASE,
  facts: 'Llegó tarde cinco veces.',
  cited_on: null,
  citation_file_id: null,
  statement: null,
  hearing_record_file_id: null,
  suspension_days: null,
  reasoning: null,
  decision_file_id: null,
};

function serve(routes: object): SentRequest[] {
  return mockApi({
    'GET /v1/auth/session': () => json(SESSION),
    'GET /v1/me/permissions': () => json(permissionsOf(HR)),
    'GET /v1/hr/employees': () => json(EMPLOYEES),
    ...routes,
  });
}

function sentTo(sent: readonly SentRequest[], ending: string): SentRequest | undefined {
  return sent.find((request) => request.method !== 'GET' && request.path.endsWith(ending));
}

function show(ui: ReactNode): void {
  renderWithApi(<Screen>{ui}</Screen>);
}

async function openDialog(name: string): Promise<HTMLElement> {
  await userEvent.click(await screen.findByRole('button', { name }));
  return screen.findByRole('dialog');
}

it('registra una incapacidad a nombre del colaborador y lista las horas extras', async () => {
  const sent = serve({
    'GET /v1/hr/leave-types': () =>
      json({ data: [{ code: 'INCAPACIDAD', label: 'Incapacidad', hr_only: true }] }),
    'GET /v1/hr/leave-requests': () => json({ data: [LEAVE] }),
    'GET /v1/hr/overtime': () => json({ data: [OVERTIME] }),
    'POST /v1/hr/leave-requests': () => json({ id: B36_ID(60) }, 201),
  });
  show(<AbsencesAdmin />);
  expect(await screen.findByText(/Decide Jefe Prueba/u)).toBeInTheDocument();
  expect(await screen.findByText('Autorizada')).toBeInTheDocument();
  const dialog = await openDialog('Registrar ausencia');
  await userEvent.selectOptions(await within(dialog).findByLabelText('Colaborador'), B36_ID(1));
  await userEvent.selectOptions(await within(dialog).findByLabelText('Tipo'), 'INCAPACIDAD');
  await userEvent.click(within(dialog).getByRole('button', { name: 'Registrar' }));
  await vi.waitFor(() => {
    expect(sentTo(sent, '/v1/hr/leave-requests')?.body).toMatchObject({
      employee_id: B36_ID(1),
      type: 'INCAPACIDAD',
    });
  });
});

it('registra y retira una novedad y cierra el mes', async () => {
  const sent = serve({
    'GET /v1/hr/payroll-novelties/periods': () => json({ data: [OPEN_PERIOD] }),
    'GET /v1/hr/payroll-novelties/periods/2026-11': () =>
      json({ period: OPEN_PERIOD, data: [NOVELTY] }),
    'GET /v1/hr/payroll-novelties/concepts': () =>
      json({
        data: [
          { code: 'BONIFICACION', label: 'Bonificación', automatic: false },
          { code: 'VACACIONES', label: 'Vacaciones', automatic: true },
        ],
      }),
    'POST /v1/hr/payroll-novelties': () => json({ id: B36_ID(61) }, 201),
    [`POST /v1/hr/payroll-novelties/${NOVELTY.id}/actions/withdraw`]: () => noContent(),
    'POST /v1/hr/payroll-novelties/close-period': () => noContent(),
  });
  show(<PayrollAdmin />);
  expect(await screen.findByText(/250\.000/u)).toBeInTheDocument();
  let dialog = await openDialog('Registrar novedad');
  const concept = await within(dialog).findByLabelText('Concepto');
  expect(within(concept).queryByText('Vacaciones')).not.toBeInTheDocument();
  await userEvent.selectOptions(within(dialog).getByLabelText('Colaborador'), B36_ID(1));
  await userEvent.selectOptions(concept, 'BONIFICACION');
  await userEvent.type(within(dialog).getByLabelText('Valor en pesos (opcional)'), '1000,5');
  await userEvent.click(within(dialog).getByRole('button', { name: 'Registrar' }));
  await vi.waitFor(() => {
    expect(sentTo(sent, '/v1/hr/payroll-novelties')?.body).toMatchObject({
      period: '2026-11',
      amount: '1000.5',
      note: null,
    });
  });
  await userEvent.click(screen.getByRole('button', { name: 'Retirar Bonificación de Ana Prueba' }));
  dialog = await openDialog('Cerrar el mes');
  await userEvent.click(within(dialog).getByRole('button', { name: 'Cerrar definitivamente' }));
  await vi.waitFor(() => {
    expect(sentTo(sent, '/close-period')?.body).toEqual({ period: '2026-11', confirm: true });
  });
  expect(sentTo(sent, '/actions/withdraw')?.headers['If-Match']).toBe('"1"');
});

it('abre un proceso, muestra el caso descifrado y cita a descargos', async () => {
  const sent = serve({
    'GET /v1/hr/disciplinary-cases': () => json({ data: [CASE] }),
    'POST /v1/hr/disciplinary-cases': () => json({ id: B36_ID(62) }, 201),
    [`POST /v1/hr/disciplinary-cases/${CASE.id}/read`]: () => json(CASE_DETAIL),
    [`POST /v1/hr/disciplinary-cases/${CASE.id}/actions/cite`]: () => noContent(),
  });
  show(<DisciplineAdmin />);
  await userEvent.click(await screen.findByRole('button', { name: 'Ver el caso DIS-2026-0001' }));
  expect(await screen.findByText('Hechos: Llegó tarde cinco veces.')).toBeInTheDocument();
  let dialog = await openDialog('Citar a descargos');
  await userEvent.type(within(dialog).getByLabelText('Fecha de los descargos'), '2026-12-01');
  await userEvent.click(within(dialog).getByRole('button', { name: 'Citar' }));
  await vi.waitFor(() => {
    expect(sentTo(sent, '/actions/cite')?.body).toEqual({
      hearing_on: '2026-12-01',
      citation_file_id: null,
    });
  });
  dialog = await openDialog('Abrir proceso');
  await userEvent.selectOptions(within(dialog).getByLabelText('Colaborador'), B36_ID(1));
  await userEvent.type(
    within(dialog).getByLabelText('Hechos'),
    'Incumplió el horario cinco veces.',
  );
  await userEvent.click(within(dialog).getByRole('button', { name: 'Abrir proceso' }));
  await vi.waitFor(() => {
    expect(sentTo(sent, '/v1/hr/disciplinary-cases')?.body).toMatchObject({
      employee_id: B36_ID(1),
    });
  });
});

it('muestra la lista del retiro y emite el paz y salvo', async () => {
  const sent = serve({
    'GET /v1/hr/offboardings': () => json({ data: [OFFBOARDING] }),
    [`POST /v1/hr/offboardings/${OFFBOARDING.id}/actions/clear`]: () => noContent(),
  });
  show(<OffboardingAdmin />);
  expect(await screen.findByText('No tiene activos por devolver.')).toBeInTheDocument();
  expect(screen.getByText(/Cuenta desactivada el/u)).toBeInTheDocument();
  await userEvent.click(
    screen.getByRole('button', { name: 'Emitir el paz y salvo de Ana Prueba' }),
  );
  await vi.waitFor(() => {
    expect(sentTo(sent, '/actions/clear')?.headers['If-Match']).toBe('"3"');
  });
  expect(screen.queryByRole('button', { name: 'Anular retiro' })).not.toBeInTheDocument();
});

it('programa formación para todos, registra asistencia y lista evaluaciones', async () => {
  const sent = serve({
    'GET /v1/hr/trainings': () => json({ data: [TRAINING] }),
    'GET /v1/hr/performance-reviews': () => json({ data: [REVIEW] }),
    'POST /v1/hr/trainings': () => json({ id: B36_ID(63) }, 201),
    [`POST /v1/hr/trainings/${TRAINING.id}/actions/attendance`]: () => noContent(),
  });
  show(<DevelopmentAdmin />);
  expect(await screen.findByText(/4,20 de 5/u)).toBeInTheDocument();
  let dialog = await openDialog('Registrar asistencia');
  await userEvent.selectOptions(within(dialog).getByLabelText('Ana Prueba: ¿asistió?'), 'si');
  await userEvent.type(within(dialog).getByLabelText(/Ana Prueba: calificación/u), '5');
  await userEvent.click(within(dialog).getByRole('button', { name: 'Guardar asistencia' }));
  await vi.waitFor(() => {
    expect(sentTo(sent, '/actions/attendance')?.body).toEqual({
      evidence_file_id: null,
      attendance: [{ employee_id: B36_ID(1), attended: true, evaluation: 5 }],
    });
  });
  dialog = await openDialog('Programar formación');
  await userEvent.type(within(dialog).getByLabelText('Título'), 'Pausas activas');
  await userEvent.selectOptions(within(dialog).getByLabelText('Clase'), 'wellbeing');
  await userEvent.selectOptions(await within(dialog).findByLabelText('Participantes'), 'todos');
  await userEvent.click(within(dialog).getByRole('button', { name: 'Programar' }));
  await vi.waitFor(() => {
    expect(sentTo(sent, '/v1/hr/trainings')?.body).toMatchObject({
      employee_ids: [B36_ID(1)],
      facilitator: null,
    });
  });
});

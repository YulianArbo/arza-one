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
import { DisciplineAdmin } from './hr-admin-discipline';
import { OffboardingAdmin } from './hr-admin-offboarding';
import { PayrollAdmin } from './hr-admin-payroll';
import {
  B36_ID,
  LEAVE,
  MY_SPACE,
  OFFBOARDING,
  OPEN_PERIOD,
  OVERTIME,
  REVIEW,
  TRAINING,
} from './hr-b36-fixtures';
import { MySpace } from './my-space';
import { MyTeam } from './my-team';

// Otros estados de las pantallas del B36: casos ya decididos, listas vacías, mes cerrado con su
// descarga, retiro con activos pendientes y los pasos siguientes del proceso disciplinario.

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
  'hr.payroll_novelty.close',
  'hr.disciplinary.manage',
  'hr.offboarding.manage',
];

function serve(routes: object): SentRequest[] {
  return mockApi({
    'GET /v1/auth/session': () => json(SESSION),
    'GET /v1/me/permissions': () => json(permissionsOf(HR)),
    'GET /v1/hr/employees': () => json({ data: [] }),
    ...routes,
  });
}

function sentTo(sent: readonly SentRequest[], ending: string): SentRequest | undefined {
  return sent.find((request) => request.method !== 'GET' && request.path.endsWith(ending));
}

function show(ui: ReactNode): void {
  renderWithApi(<Screen>{ui}</Screen>);
}

const DECIDED_CASE = {
  id: B36_ID(70),
  code: 'DIS-2026-0002',
  employee: { id: B36_ID(1), name: 'Ana Prueba' },
  status: 'decided',
  opened_on: '2026-11-01',
  hearing_on: '2026-11-10',
  decided_on: '2026-11-12',
  decision: 'suspension',
  facts: 'Faltó tres días sin aviso.',
  cited_on: '2026-11-03',
  suspension_days: 2,
  reasoning: 'Se comprobaron las faltas.',
  version: 4,
};

const SPACE_ROUTES = {
  'GET /v1/hr/leave-types': () => json({ data: [] }),
  'GET /v1/hr/me/leave-requests': () =>
    json({ data: [{ ...LEAVE, status: 'rejected', decision_note: 'No hay reemplazo' }] }),
  'GET /v1/hr/me/overtime': () =>
    json({ data: [{ ...OVERTIME, status: 'reported', reported_hours: 1.5 }] }),
  'GET /v1/hr/me/performance-reviews': () =>
    json({
      data: [{ ...REVIEW, status: 'draft', score: null, reviewer_comment: null, can_agree: false }],
    }),
  'GET /v1/hr/me/trainings': () =>
    json({ data: [{ ...TRAINING, attendees: [{ ...TRAINING.attendees[0], attended: true }] }] }),
  'GET /v1/hr/me/novelties': () => json({ data: [] }),
  'GET /v1/hr/me/tasks': () =>
    json({
      data: [
        {
          id: B36_ID(71),
          kind: 'offboarding',
          item: 'exit_exam',
          title: 'Examen médico ocupacional de egreso',
          employee: { id: B36_ID(1), name: 'Ana Prueba' },
          due_on: null,
          version: 2,
        },
      ],
    }),
  'POST /v1/hr/me/disciplinary-cases/read': () => json({ data: [DECIDED_CASE] }),
  [`POST /v1/hr/offboardings/${B36_ID(71)}/items/exit_exam/actions/complete`]: () => noContent(),
};

it('Mi espacio sin jefe, sin contrato ni equipo, con casos ya decididos', async () => {
  const employment = MY_SPACE.employment;
  if (employment === null) throw new Error('Falta el colaborador de prueba');
  const sent = serve({
    ...SPACE_ROUTES,
    'GET /v1/hr/me': () =>
      json({
        employment: {
          ...employment,
          manager: null,
          salary_band_label: null,
          contract_available: false,
          has_team: false,
        },
      }),
  });
  show(<MySpace />);
  expect(await screen.findByText('Sin contrato registrado')).toBeInTheDocument();
  expect(screen.getByText('Talento humano')).toBeInTheDocument();
  expect(screen.queryByRole('link', { name: 'Ir a Mi equipo' })).not.toBeInTheDocument();
  expect(await screen.findByText(/Rechazada · No hay reemplazo/u)).toBeInTheDocument();
  expect(await screen.findByText(/Suspensión \(2 días\)/u)).toBeInTheDocument();
  expect(await screen.findByText(/Asistió/u)).toBeInTheDocument();
  expect(screen.getByText('No tiene novedades registradas.')).toBeInTheDocument();
  expect(screen.queryByRole('button', { name: 'Aceptar evaluación' })).not.toBeInTheDocument();
  await userEvent.click(await screen.findByRole('button', { name: 'Marcar hecha' }));
  const dialog = await screen.findByRole('dialog');
  await userEvent.click(within(dialog).getByRole('button', { name: 'Guardar' }));
  await vi.waitFor(() => {
    expect(sentTo(sent, '/items/exit_exam/actions/complete')?.headers['If-Match']).toBe('"2"');
  });
});

it('Mi equipo vacío dice que no hay nada por decidir', async () => {
  serve({
    'GET /v1/hr/me/team': () => json({ data: [] }),
    'GET /v1/hr/me/team/leave-requests': () => json({ data: [] }),
    'GET /v1/hr/me/team/overtime': () => json({ data: [] }),
    'GET /v1/hr/me/team/performance-reviews': () => json({ data: [] }),
  });
  show(<MyTeam />);
  expect(await screen.findByText('No hay solicitudes de su equipo.')).toBeInTheDocument();
  expect(screen.getByText('No hay horas extras de su equipo.')).toBeInTheDocument();
  expect(screen.getByText('No hay evaluaciones de su equipo.')).toBeInTheDocument();
  expect(
    await screen.findByText('No tiene personas a cargo en el organigrama.'),
  ).toBeInTheDocument();
  expect(screen.queryByRole('button', { name: 'Nueva evaluación' })).not.toBeInTheDocument();
});

it('un mes cerrado solo ofrece descargar el archivo', async () => {
  const closed = { ...OPEN_PERIOD, status: 'closed', closed_on: '2026-11-30', closed_by: null };
  const createObjectURL = vi.fn(() => 'blob:novedades');
  vi.stubGlobal('URL', Object.assign(URL, { createObjectURL, revokeObjectURL: vi.fn() }));
  const csv = new Response('periodo;documento\r\n', {
    headers: { 'Content-Disposition': 'attachment; filename="novedades-nomina-2026-11.csv"' },
  });
  serve({
    'GET /v1/hr/payroll-novelties/periods': () =>
      json({ data: [closed, { ...OPEN_PERIOD, period: '2026-12', novelties: 0 }] }),
    'GET /v1/hr/payroll-novelties/periods/2026-11': () => json({ period: closed, data: [] }),
    'GET /v1/hr/payroll-novelties/periods/2026-12': () =>
      json({ period: { ...OPEN_PERIOD, period: '2026-12', novelties: 0 }, data: [] }),
    'POST /v1/hr/payroll-novelties/periods/2026-11/export': () => csv,
  });
  show(<PayrollAdmin />);
  expect(await screen.findByText('Este mes no tiene novedades.')).toBeInTheDocument();
  expect(screen.queryByRole('button', { name: 'Cerrar el mes' })).not.toBeInTheDocument();
  await userEvent.click(screen.getByRole('button', { name: 'Descargar archivo de 2026-11' }));
  await vi.waitFor(() => {
    expect(createObjectURL).toHaveBeenCalledOnce();
  });
  await userEvent.click(screen.getByRole('button', { name: /2026-12 · Abierto/u }));
  expect(await screen.findByRole('button', { name: 'Cerrar el mes' })).toBeInTheDocument();
});

it('el retiro con activos pendientes no ofrece paz y salvo y se puede anular', async () => {
  const pending = {
    ...OFFBOARDING,
    account_deactivated_at: null,
    can_clear: false,
    assets: [
      { id: B36_ID(72), code: 'ACT-2026-0001', name: 'Portátil', assigned_on: '2026-02-01' },
    ],
    checklist: [{ ...OFFBOARDING.checklist[0], done_on: null, done_by: null, responsible: null }],
  };
  const sent = serve({
    'GET /v1/hr/offboardings': () =>
      json({
        data: [
          pending,
          { ...OFFBOARDING, id: B36_ID(73), status: 'cleared', cleared_on: '2026-11-19' },
        ],
      }),
    [`POST /v1/hr/offboardings/${OFFBOARDING.id}/actions/cancel`]: () => noContent(),
  });
  show(<OffboardingAdmin />);
  expect(await screen.findByText(/ACT-2026-0001 Portátil/u)).toBeInTheDocument();
  expect(screen.getByText(/Sin responsable · Pendiente/u)).toBeInTheDocument();
  expect(screen.getByText(/La cuenta se desactivará al terminar/u)).toBeInTheDocument();
  expect(screen.getByText(/Paz y salvo emitido el/u)).toBeInTheDocument();
  expect(screen.queryByRole('button', { name: /Emitir el paz y salvo/u })).not.toBeInTheDocument();
  await userEvent.click(screen.getByRole('button', { name: 'Anular retiro' }));
  const dialog = await screen.findByRole('dialog');
  await userEvent.type(within(dialog).getByLabelText('Motivo'), 'Se queda');
  await userEvent.click(within(dialog).getByRole('button', { name: 'Anular' }));
  await vi.waitFor(() => {
    expect(sentTo(sent, '/actions/cancel')?.body).toEqual({ reason: 'Se queda' });
  });
});

it('registra los descargos y la decisión de suspensión', async () => {
  const heard = { ...DECIDED_CASE, status: 'heard', decision: null, decided_on: null, version: 3 };
  const cited = { ...heard, id: B36_ID(74), code: 'DIS-2026-0003', status: 'cited', version: 2 };
  const sent = serve({
    'GET /v1/hr/disciplinary-cases': () => json({ data: [heard, cited] }),
    [`POST /v1/hr/disciplinary-cases/${heard.id}/actions/decide`]: () => noContent(),
    [`POST /v1/hr/disciplinary-cases/${cited.id}/actions/hearing`]: () => noContent(),
  });
  show(<DisciplineAdmin />);
  await userEvent.click(await screen.findByRole('button', { name: 'Decidir' }));
  let dialog = await screen.findByRole('dialog');
  await userEvent.selectOptions(within(dialog).getByLabelText('Decisión'), 'suspension');
  await userEvent.type(within(dialog).getByLabelText('Días de suspensión'), '2');
  await userEvent.type(
    within(dialog).getByLabelText('Motivación'),
    'Se comprobaron las faltas reiteradas.',
  );
  await userEvent.click(within(dialog).getByRole('button', { name: 'Registrar decisión' }));
  await vi.waitFor(() => {
    expect(sentTo(sent, '/actions/decide')?.body).toMatchObject({
      decision: 'suspension',
      suspension_days: 2,
      decision_file_id: null,
    });
  });
  await userEvent.click(await screen.findByRole('button', { name: 'Registrar descargos' }));
  dialog = await screen.findByRole('dialog');
  await userEvent.type(
    within(dialog).getByLabelText('Resumen de los descargos'),
    'Reconoce las faltas.',
  );
  await userEvent.type(within(dialog).getByLabelText('Identificador del acta firmada'), B36_ID(75));
  await userEvent.click(within(dialog).getByRole('button', { name: 'Registrar' }));
  await vi.waitFor(() => {
    expect(sentTo(sent, '/actions/hearing')?.body).toEqual({
      statement: 'Reconoce las faltas.',
      hearing_record_file_id: B36_ID(75),
    });
  });
});

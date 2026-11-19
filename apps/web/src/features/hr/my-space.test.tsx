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
import { B36_ID, LEAVE, MY_SPACE, NOVELTY, OVERTIME, REVIEW, TRAINING } from './hr-b36-fixtures';
import { MySpace } from './my-space';

// «Mi espacio» (B36): saldo de vacaciones, banda salarial (nunca el valor), solicitudes propias,
// evaluaciones por aceptar, citaciones y tareas a cargo.

vi.mock('next/navigation', () => ({
  usePathname: () => '/app/mi-espacio',
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
}));

beforeEach(() => {
  vi.stubGlobal('scrollTo', vi.fn());
});
afterEach(() => vi.unstubAllGlobals());

const TASK = {
  id: B36_ID(20),
  kind: 'onboarding',
  item: null,
  title: 'Entrenamiento en el cargo',
  employee: { id: B36_ID(21), name: 'Luis Nuevo' },
  due_on: '2026-12-01',
  version: 1,
};

const CITATION = {
  id: B36_ID(22),
  code: 'DIS-2026-0001',
  employee: { id: B36_ID(1), name: 'Ana Prueba' },
  status: 'cited',
  opened_on: '2026-11-10',
  hearing_on: '2026-11-25',
  decided_on: null,
  decision: null,
  facts: 'Llegó tarde cinco veces en el mes.',
  cited_on: '2026-11-18',
  suspension_days: null,
  reasoning: null,
  version: 2,
};

function serve(overrides: object = {}): SentRequest[] {
  return mockApi({
    'GET /v1/auth/session': () => json(SESSION),
    'GET /v1/me/permissions': () => json(permissionsOf(['hr.employee.read', 'hr.leave.request'])),
    'GET /v1/hr/me': () => json(MY_SPACE),
    'GET /v1/hr/leave-types': () =>
      json({
        data: [
          { code: 'VACACIONES', label: 'Vacaciones', hr_only: false },
          { code: 'INCAPACIDAD', label: 'Incapacidad', hr_only: true },
        ],
      }),
    'GET /v1/hr/me/leave-requests': () => json({ data: [LEAVE] }),
    'GET /v1/hr/me/overtime': () => json({ data: [OVERTIME] }),
    'GET /v1/hr/me/performance-reviews': () => json({ data: [REVIEW] }),
    'GET /v1/hr/me/trainings': () => json({ data: [TRAINING] }),
    'GET /v1/hr/me/novelties': () => json({ data: [NOVELTY] }),
    'GET /v1/hr/me/tasks': () => json({ data: [TASK] }),
    'POST /v1/hr/me/disciplinary-cases/read': () => json({ data: [CITATION] }),
    'POST /v1/hr/me/leave-requests': () => json({ id: B36_ID(30) }, 201),
    [`POST /v1/hr/me/leave-requests/${LEAVE.id}/actions/cancel`]: () => noContent(),
    [`POST /v1/hr/overtime/${OVERTIME.id}/actions/report`]: () => noContent(),
    [`POST /v1/hr/performance-reviews/${REVIEW.id}/actions/agree`]: () => noContent(),
    [`POST /v1/hr/me/tasks/onboarding/${TASK.id}/actions/complete`]: () => noContent(),
    ...overrides,
  });
}

function sentTo(sent: readonly SentRequest[], ending: string): SentRequest | undefined {
  return sent.find((request) => request.method !== 'GET' && request.path.endsWith(ending));
}

function show(): void {
  renderWithApi(
    <Screen>
      <MySpace />
    </Screen>,
  );
}

it('muestra el saldo, la banda y la citación, sin el valor del salario', async () => {
  serve();
  show();
  expect(await screen.findByText('13,04 días')).toBeInTheDocument();
  expect(screen.getByText('Banda 2')).toBeInTheDocument();
  expect(await screen.findByText('Llegó tarde cinco veces en el mes.')).toBeInTheDocument();
  expect(screen.getByRole('link', { name: 'Ir a Mi equipo' })).toHaveAttribute(
    'href',
    '/app/mi-espacio/equipo',
  );
  expect(screen.queryByText(/3\.500\.000/u)).not.toBeInTheDocument();
});

it('solicita vacaciones sin ofrecer la incapacidad y retira una radicada', async () => {
  const sent = serve();
  show();
  await userEvent.click(await screen.findByRole('button', { name: 'Solicitar ausencia' }));
  const dialog = await screen.findByRole('dialog');
  const type = within(dialog).getByLabelText('Tipo');
  expect(within(type).queryByText('Incapacidad')).not.toBeInTheDocument();
  await userEvent.selectOptions(type, 'VACACIONES');
  const field = (label: string) => within(dialog).getByLabelText(label);
  await userEvent.clear(field('Desde'));
  await userEvent.type(field('Desde'), '2026-12-14');
  await userEvent.clear(field('Hasta'));
  await userEvent.type(field('Hasta'), '2026-12-18');
  await userEvent.click(within(dialog).getByRole('button', { name: 'Enviar solicitud' }));
  await vi.waitFor(() => {
    expect(sentTo(sent, '/me/leave-requests')?.body).toMatchObject({
      type: 'VACACIONES',
      starts_on: '2026-12-14',
      note: null,
    });
  });
  await userEvent.click(screen.getByRole('button', { name: 'Retirar la solicitud de Vacaciones' }));
  await vi.waitFor(() => {
    expect(sentTo(sent, '/actions/cancel')?.headers['If-Match']).toBe('"1"');
  });
});

it('reporta horas extras, acepta la evaluación y marca una tarea hecha', async () => {
  const sent = serve();
  show();
  await userEvent.click(await screen.findByRole('button', { name: 'Reportar horas' }));
  let dialog = await screen.findByRole('dialog');
  await userEvent.type(within(dialog).getByLabelText('Horas trabajadas'), '1.5');
  await userEvent.click(within(dialog).getByRole('button', { name: 'Reportar' }));
  await vi.waitFor(() => {
    expect(sentTo(sent, '/actions/report')?.body).toEqual({ hours: 1.5 });
  });
  await userEvent.click(await screen.findByRole('button', { name: 'Aceptar evaluación' }));
  dialog = await screen.findByRole('dialog');
  await userEvent.click(within(dialog).getByRole('button', { name: 'Aceptar' }));
  await vi.waitFor(() => {
    expect(sentTo(sent, '/actions/agree')?.body).toEqual({ comment: null });
  });
  await userEvent.click(await screen.findByRole('button', { name: 'Marcar hecha' }));
  dialog = await screen.findByRole('dialog');
  await userEvent.click(within(dialog).getByRole('button', { name: 'Guardar' }));
  await vi.waitFor(() => {
    expect(sentTo(sent, `/onboarding/${TASK.id}/actions/complete`)?.headers['If-Match']).toBe(
      '"1"',
    );
  });
});

it('avisa cuando la cuenta no está vinculada como colaborador', async () => {
  serve({ 'GET /v1/hr/me': () => json({ employment: null }) });
  show();
  expect(
    await screen.findByText(/Su cuenta aún no está vinculada como colaborador/u),
  ).toBeInTheDocument();
});

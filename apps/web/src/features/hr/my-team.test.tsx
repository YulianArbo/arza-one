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
import { B36_ID, LEAVE, OVERTIME, REVIEW } from './hr-b36-fixtures';
import { MyTeam } from './my-team';

// «Mi equipo» (B36, decisión 2): el jefe aprueba, rechaza con motivo, autoriza horas extras, fija
// objetivos y califica.

vi.mock('next/navigation', () => ({
  usePathname: () => '/app/mi-espacio/equipo',
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
}));

beforeEach(() => {
  vi.stubGlobal('scrollTo', vi.fn());
});
afterEach(() => vi.unstubAllGlobals());

function serve(): SentRequest[] {
  return mockApi({
    'GET /v1/auth/session': () => json(SESSION),
    'GET /v1/me/permissions': () => json(permissionsOf(['hr.employee.read'])),
    'GET /v1/hr/me/team': () =>
      json({
        data: [
          {
            employee_id: B36_ID(1),
            name: 'Ana Prueba',
            position: { id: B36_ID(3), name: 'Analista' },
            vacation_available: '13.04',
          },
        ],
      }),
    'GET /v1/hr/me/team/leave-requests': () => json({ data: [LEAVE] }),
    'GET /v1/hr/me/team/overtime': () =>
      json({ data: [{ ...OVERTIME, status: 'requested', can_decide: true, version: 1 }] }),
    'GET /v1/hr/me/team/performance-reviews': () =>
      json({
        data: [{ ...REVIEW, status: 'draft', score: null, can_score: true, can_agree: false }],
      }),
    [`POST /v1/hr/leave-requests/${LEAVE.id}/actions/approve`]: () => noContent(),
    [`POST /v1/hr/overtime/${OVERTIME.id}/actions/reject`]: () => noContent(),
    [`POST /v1/hr/performance-reviews/${REVIEW.id}/actions/score`]: () => noContent(),
    'POST /v1/hr/performance-reviews': () => json({ id: B36_ID(40) }, 201),
  });
}

function sentTo(sent: readonly SentRequest[], ending: string): SentRequest | undefined {
  return sent.find((request) => request.method !== 'GET' && request.path.endsWith(ending));
}

function show(): void {
  renderWithApi(
    <Screen>
      <MyTeam />
    </Screen>,
  );
}

function only(element: HTMLElement | undefined): HTMLElement {
  if (element === undefined) throw new Error('No se encontró el botón');
  return element;
}

async function openDialog(name: string): Promise<HTMLElement> {
  await userEvent.click(only((await screen.findAllByRole('button', { name }))[0]));
  return screen.findByRole('dialog');
}

it('aprueba la ausencia y no autoriza las horas extras con su motivo', async () => {
  const sent = serve();
  show();
  expect(await screen.findByText(/13,04 días de vacaciones disponibles/u)).toBeInTheDocument();
  let dialog = await openDialog('Aprobar');
  await userEvent.click(within(dialog).getByRole('button', { name: 'Aprobar' }));
  await vi.waitFor(() => {
    expect(sentTo(sent, '/actions/approve')?.body).toEqual({ note: null });
  });
  const rejects = await screen.findAllByRole('button', { name: 'Rechazar' });
  await userEvent.click(only(rejects.at(-1)));
  dialog = await screen.findByRole('dialog');
  await userEvent.type(within(dialog).getByLabelText('Motivo'), 'No hace falta');
  await userEvent.click(within(dialog).getByRole('button', { name: 'Rechazar' }));
  await vi.waitFor(() => {
    expect(sentTo(sent, `/overtime/${OVERTIME.id}/actions/reject`)?.body).toEqual({
      note: 'No hace falta',
    });
  });
});

it('califica cada objetivo y fija los de una evaluación nueva', async () => {
  const sent = serve();
  show();
  let dialog = await openDialog('Calificar');
  await userEvent.type(within(dialog).getByLabelText('Entregar a tiempo (60 %)'), '5');
  await userEvent.type(within(dialog).getByLabelText('Documentar (40 %)'), '3');
  await userEvent.type(within(dialog).getByLabelText('Comentario para el colaborador'), 'Buen año');
  await userEvent.click(within(dialog).getByRole('button', { name: 'Guardar calificación' }));
  await vi.waitFor(() => {
    expect(sentTo(sent, '/actions/score')?.body).toEqual({ scores: [5, 3], comment: 'Buen año' });
  });
  dialog = await openDialog('Nueva evaluación');
  await userEvent.selectOptions(within(dialog).getByLabelText('Colaborador'), B36_ID(1));
  await userEvent.type(within(dialog).getByLabelText(/Periodo/u), '2026');
  await userEvent.type(within(dialog).getByLabelText('Objetivo 1'), 'Entregar a tiempo');
  await userEvent.type(within(dialog).getByLabelText('Peso del objetivo 1 (%)'), '100');
  await userEvent.click(within(dialog).getByRole('button', { name: 'Guardar objetivos' }));
  await vi.waitFor(() => {
    expect(sentTo(sent, '/performance-reviews')?.body).toEqual({
      employee_id: B36_ID(1),
      period: '2026',
      objectives: [{ title: 'Entregar a tiempo', weight: 100 }],
    });
  });
});

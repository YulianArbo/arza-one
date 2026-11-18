import type { Candidate, PermissionCode } from '@arza/contracts';
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
import { BANKED, CANDIDATE, CANDIDATE_ID, VACANCY } from './hr-fixtures';
import { HrHome } from './hr-home';

// Selección (B35): vacantes, avance y descarte de candidaturas y el aplazamiento de la eliminación
// para quien está en el banco de hojas de vida, siempre con la versión que se vio.

vi.mock('next/navigation', () => ({
  usePathname: () => '/app/talento-y-sst',
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
}));

const RECRUITER: readonly PermissionCode[] = ['hr.vacancy.manage', 'hr.candidate.manage'];

function serve(candidate: Candidate, extra: object = {}): SentRequest[] {
  return mockApi({
    'GET /v1/auth/session': () => json(SESSION),
    'GET /v1/me/permissions': () => json(permissionsOf(RECRUITER)),
    'GET /v1/hr/vacancies': () => json({ data: [VACANCY] }),
    'GET /v1/hr/candidates': () => json({ data: [candidate] }),
    ...extra,
  });
}

function show(): void {
  renderWithApi(
    <Screen>
      <HrHome />
    </Screen>,
  );
}

function sentTo(sent: readonly SentRequest[], ending: string): SentRequest | undefined {
  return sent.find((request) => request.method !== 'GET' && request.path.endsWith(ending));
}

async function openDialog(button: string): Promise<HTMLElement> {
  await userEvent.click(await screen.findByRole('button', { name: button }));
  return screen.findByRole('dialog');
}

beforeEach(() => {
  vi.stubGlobal('scrollTo', vi.fn());
});

afterEach(() => {
  vi.unstubAllGlobals();
});

it('lista vacantes y candidaturas sin la ficha de colaboradores', async () => {
  const sent = serve(CANDIDATE);
  show();
  expect(await screen.findByText('Analista de pruebas')).toBeInTheDocument();
  expect(await screen.findByText('Ana Prueba')).toBeInTheDocument();
  expect(screen.getByText('Postulado')).toBeInTheDocument();
  expect(screen.queryByRole('heading', { name: 'Colaboradores' })).not.toBeInTheDocument();
  expect(sent.map(({ path }) => path)).not.toContain('/v1/hr/employees');
});

it('avanza la candidatura con su versión', async () => {
  const sent = serve(CANDIDATE, {
    [`POST /v1/hr/candidates/${CANDIDATE_ID}/actions/advance`]: () => noContent(),
  });
  show();
  const dialog = await openDialog('Avanzar');
  await userEvent.click(within(dialog).getByRole('button', { name: 'Confirmar avance' }));
  await vi.waitFor(() => {
    expect(sentTo(sent, '/actions/advance')?.headers['If-Match']).toBe('"3"');
  });
});

it('exige el motivo para descartar y lo envía con la versión', async () => {
  const sent = serve(CANDIDATE, {
    [`POST /v1/hr/candidates/${CANDIDATE_ID}/actions/discard`]: () => noContent(),
  });
  show();
  const dialog = await openDialog('Descartar');
  const submit = within(dialog).getByRole('button', { name: 'Descartar candidatura' });
  await userEvent.click(submit);
  expect(sentTo(sent, '/actions/discard')).toBeUndefined();
  await userEvent.type(within(dialog).getByLabelText('Motivo del descarte'), 'Otro perfil');
  await userEvent.click(submit);
  await vi.waitFor(() => {
    expect(sentTo(sent, '/actions/discard')?.body).toEqual({ reason: 'Otro perfil' });
  });
  expect(sentTo(sent, '/actions/discard')?.headers['If-Match']).toBe('"3"');
});

it('muestra la fecha de eliminación y aplaza doce meses a quien está en el banco', async () => {
  const sent = serve(BANKED, {
    [`POST /v1/hr/candidates/${CANDIDATE_ID}/actions/extend-retention`]: () => noContent(),
  });
  show();
  expect(await screen.findByText(/Eliminación prevista 10\/11\/2027/)).toBeInTheDocument();
  expect(screen.queryByRole('button', { name: 'Descartar' })).not.toBeInTheDocument();
  const dialog = await openDialog('Aplazar eliminación');
  expect(within(dialog).getByText(/se eliminan el 10\/11\/2027/)).toBeInTheDocument();
  await userEvent.click(within(dialog).getByRole('button', { name: 'Aplazar doce meses' }));
  await vi.waitFor(() => {
    expect(sentTo(sent, '/actions/extend-retention')?.headers['If-Match']).toBe('"3"');
  });
});

it('no ofrece aplazar a quien no autorizó el banco ni a quien ya se eliminó', async () => {
  serve({ ...BANKED, talent_bank: false });
  show();
  expect(await screen.findByText(/Descartado · Eliminación prevista/)).toBeInTheDocument();
  expect(screen.queryByRole('button', { name: 'Aplazar eliminación' })).not.toBeInTheDocument();
});

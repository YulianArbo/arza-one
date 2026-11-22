import type { PermissionCode } from '@arza/contracts';
import { screen, within } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

import { json, noContent } from '../../test-support/fake-api';
import { ANA, COMPLAINT, LUIS, MY_SST, SST_ID } from './sst-fixtures';
import { SstCommittees } from './sst-committees';
import { SstHome } from './sst-home';
import { openDialog, sentTo, serveSst, show } from './sst-test-support';
import { TalentLanding } from './talent-landing';

// Comités y portada de SST (B37, decisiones 8 y 9): lo de Convivencia solo aparece a sus
// integrantes; quien solo lee SST entra directo a la portada de SST.

vi.mock('next/navigation', () => ({
  usePathname: () => '/app/talento-y-sst/sst',
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
}));

beforeEach(() => {
  vi.stubGlobal('scrollTo', vi.fn());
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

const SST: readonly PermissionCode[] = [
  'sst.read',
  'sst.committee.read',
  'sst.committee.manage',
  'sst.incident.report',
];

const MEMBER = {
  id: SST_ID(54),
  committee: 'coexistence',
  person: ANA,
  role: 'member',
  represents: 'workers',
  from_on: '2026-01-01',
  until_on: null,
  active: true,
  version: 1,
};

const MINUTE = {
  id: SST_ID(56),
  committee: 'coexistence',
  meeting_on: '2026-11-10',
  summary: 'Se revisó un caso.',
  file_id: null,
  recorded_by: ANA,
  version: 1,
};

const ROUTES = {
  'GET /v1/sst/me': () => json(MY_SST),
  'GET /v1/sst/committee-members': () => json({ data: [MEMBER] }),
  'POST /v1/sst/committee-members': () => json({ id: SST_ID(55) }, 201),
  [`POST /v1/sst/committee-members/${MEMBER.id}/actions/end`]: () => noContent(),
  'POST /v1/sst/committee-minutes/read': () => json({ data: [MINUTE] }),
  'POST /v1/sst/committee-minutes': () => json({ id: SST_ID(57) }, 201),
  'POST /v1/sst/complaints/read': () => json({ data: [COMPLAINT] }),
  [`POST /v1/sst/complaints/${COMPLAINT.id}/actions/handle`]: () => noContent(),
};

const OUTSIDER = { ...ROUTES, 'GET /v1/sst/me': () => json({ ...MY_SST, committees: [] }) };

it('el integrante de Convivencia ve las actas y tramita las quejas', async () => {
  const sent = serveSst(ROUTES, SST);
  show(<SstCommittees />);
  const minutes = 'Ver las actas de Comité de Convivencia Laboral';
  await userEvent.click(await screen.findByRole('button', { name: minutes }));
  expect(await screen.findByText(/Se revisó un caso/u)).toBeInTheDocument();
  await userEvent.click(screen.getByRole('button', { name: 'Ver las quejas de convivencia' }));
  expect(await screen.findByText('Me gritan en las reuniones.')).toBeInTheDocument();
  const dialog = await openDialog('Tramitar');
  await userEvent.selectOptions(within(dialog).getByLabelText('Estado'), 'in_review');
  await userEvent.click(within(dialog).getByRole('button', { name: 'Guardar' }));
  await vi.waitFor(() => {
    expect(sentTo(sent, '/actions/handle')?.body).toEqual({ status: 'in_review', outcome: null });
  });
});

it('SST no ve lo de Convivencia si no lo integra y termina un periodo', async () => {
  const sent = serveSst(OUTSIDER, SST);
  show(<SstCommittees />);
  expect(await screen.findByText(/solo las ven los integrantes vigentes/u)).toBeInTheDocument();
  expect(screen.queryByText('Quejas de convivencia')).not.toBeInTheDocument();
  expect(await screen.findByText('Ana Prueba')).toBeInTheDocument();
  const dialog = await openDialog('Terminar periodo');
  await userEvent.type(within(dialog).getByLabelText('Último día'), '2026-12-31');
  await userEvent.click(within(dialog).getByRole('button', { name: 'Terminar' }));
  await vi.waitFor(() => {
    expect(sentTo(sent, '/actions/end')?.body).toEqual({ until_on: '2026-12-31' });
  });
});

it('SST agrega un integrante y registra un acta del COPASST', async () => {
  const sent = serveSst(OUTSIDER, SST);
  show(<SstCommittees />);
  let dialog = await openDialog('Agregar integrante');
  const field = (label: string) => within(dialog).getByLabelText(label);
  await userEvent.selectOptions(field('Comité'), 'copasst');
  await userEvent.selectOptions(field('Persona'), LUIS.id);
  await userEvent.selectOptions(field('Papel'), 'president');
  await userEvent.selectOptions(field('Representa a'), 'employer');
  await userEvent.type(field('Desde'), '2026-11-01');
  await userEvent.click(within(dialog).getByRole('button', { name: 'Agregar' }));
  await vi.waitFor(() => {
    const body = sentTo(sent, '/v1/sst/committee-members')?.body;
    expect(body).toMatchObject({ until_on: null, role: 'president' });
  });
  dialog = await openDialog('Registrar acta');
  await userEvent.type(within(dialog).getByLabelText('Fecha de la reunión'), '2026-11-15');
  await userEvent.type(within(dialog).getByLabelText('Temas y compromisos'), 'Inspección.');
  await userEvent.click(within(dialog).getByRole('button', { name: 'Registrar' }));
  await vi.waitFor(() => {
    const body = sentTo(sent, '/v1/sst/committee-minutes')?.body;
    expect(body).toMatchObject({ committee: 'copasst', file_id: null });
  });
});

const COMPLIANCE = {
  total: 0,
  done: 0,
  due_to_date: 0,
  done_of_due: 0,
  year_percent: 0,
  to_date_percent: 100,
};

it('quien solo lee SST entra directo a la portada de SST', async () => {
  vi.setSystemTime(new Date('2026-11-20T15:00:00.000Z'));
  serveSst(
    {
      'GET /v1/sst/incidents': () => json({ data: [] }),
      'GET /v1/sst/work-plan': () => json({ year: 2026, compliance: COMPLIANCE, data: [] }),
      'GET /v1/sst/standards-assessments/2026/score': () =>
        json({ year: 2026, score: 4000, rating: 'critical', assessed: 10, total: 60 }),
    },
    ['sst.read'],
  );
  show(<TalentLanding />);
  const title = 'Seguridad y salud en el trabajo';
  expect(await screen.findByRole('heading', { name: title })).toBeInTheDocument();
  expect(await screen.findByText('Crítico')).toBeInTheDocument();
  expect(screen.getByText('Plazo: 2 días hábiles')).toBeInTheDocument();
  const link = screen.getByRole('link', { name: 'Matriz de peligros' });
  expect(link).toHaveAttribute('href', '/app/talento-y-sst/sst/peligros');
});

it('la portada de SST cuenta los accidentes con plazo vencido', async () => {
  const accident = {
    id: SST_ID(58),
    code: 'SST-2026-0009',
    kind: 'accident',
    status: 'reported',
    occurred_at: '2026-11-10T14:00:00.000Z',
    location: 'Bodega',
    affected: 'other',
    affected_employee: null,
    reported_by: ANA,
    arl_due_on: '2026-11-12',
    arl_reported_on: null,
    arl_overdue: true,
    version: 1,
  };
  serveSst(
    {
      'GET /v1/sst/incidents': () => json({ data: [accident] }),
      'GET /v1/sst/work-plan': () => json({ year: 2026, compliance: COMPLIANCE, data: [] }),
    },
    SST,
  );
  show(<SstHome />);
  expect(await screen.findByText('Hay plazos vencidos')).toBeInTheDocument();
});

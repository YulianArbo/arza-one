import { screen, within } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { Screen } from '../../test-support/core-fixtures';
import { json, noContent, renderWithApi } from '../../test-support/fake-api';
import {
  CAN_NOTHING,
  ENTRY_ID,
  PROJECT_ID,
  PROJECT_LEADER,
  PROJECT_MEMBER,
  detailRoute,
  serveProjects,
} from '../../test-support/project-fixtures';
import { MyHours } from './my-hours';
import { ProjectDetailPanel } from './project-detail';

// Horas de un proyecto y «Mis horas» (B27): registrar con las reglas de la ficha 17.8, aprobar las
// elegidas, devolver con un motivo y borrar las propias.

vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace: vi.fn(), push: vi.fn(), back: vi.fn() }),
  usePathname: () => '/app/proyectos',
}));

beforeEach(() => {
  vi.stubGlobal('scrollTo', vi.fn());
});

afterEach(() => {
  vi.unstubAllGlobals();
});

const BASE = `/v1/projects/${PROJECT_ID}`;

async function openHours(): Promise<void> {
  renderWithApi(
    <Screen>
      <ProjectDetailPanel id={PROJECT_ID} />
    </Screen>,
  );
  await userEvent.click(await screen.findByRole('tab', { name: 'Horas' }));
}

describe('registrar horas', () => {
  it('revisa el día y los cuartos de hora antes de enviar', async () => {
    const sent = serveProjects(PROJECT_LEADER, {
      [`POST ${BASE}/time-entries`]: () => json({ id: ENTRY_ID }, 201),
    });
    await openHours();
    await userEvent.click(await screen.findByRole('button', { name: 'Registrar horas' }));
    const dialog = await screen.findByRole('dialog');
    const date = within(dialog).getByLabelText('Día trabajado');
    await userEvent.clear(date);
    await userEvent.type(date, '2026-10-20');
    await userEvent.type(within(dialog).getByLabelText('Horas'), '1,1');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Registrar' }));
    expect(within(dialog).getAllByText(/siete días de atraso/u).length).toBeGreaterThan(0);
    expect(within(dialog).getAllByText(/cuartos de hora/u).length).toBeGreaterThan(0);
    await userEvent.clear(date);
    await userEvent.type(date, '2026-11-04');
    await userEvent.clear(within(dialog).getByLabelText('Horas'));
    await userEvent.type(within(dialog).getByLabelText('Horas'), '1,5');
    await userEvent.click(within(dialog).getByLabelText('Se cobra al cliente'));
    await userEvent.click(within(dialog).getByRole('button', { name: 'Registrar' }));
    await vi.waitFor(() => {
      const post = sent.find((request) => request.method === 'POST');
      expect(post?.body).toMatchObject({ work_date: '2026-11-04', hours: 1.5, billable: false });
    });
  });
});

describe('aprobar y devolver', () => {
  it('aprueba las elegidas y devuelve con un motivo', async () => {
    const sent = serveProjects(PROJECT_LEADER, {
      [`POST ${BASE}/time-entries/actions/approve`]: () => json({ approved: 1 }, 201),
      [`POST ${BASE}/time-entries/${ENTRY_ID}/actions/return`]: () => noContent(),
    });
    await openHours();
    await userEvent.click(await screen.findByRole('checkbox', { name: /Carlos Ruiz/u }));
    await userEvent.click(screen.getByRole('button', { name: 'Aprobar las elegidas (1)' }));
    await vi.waitFor(() => {
      expect(sent.some((r) => r.path.endsWith('/approve'))).toBe(true);
    });
    await userEvent.click(screen.getByRole('button', { name: 'Devolver' }));
    const dialog = await screen.findByRole('dialog');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Devolver' }));
    expect(within(dialog).getAllByText(/qué debe corregir/u).length).toBeGreaterThan(0);
    await userEvent.type(within(dialog).getByLabelText('Qué debe corregir'), 'Indique el ítem.');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Devolver' }));
    await vi.waitFor(() => {
      expect(sent.find((r) => r.path.endsWith('/return'))?.body).toEqual({
        reason: 'Indique el ítem.',
      });
    });
  });
});

describe('las propias', () => {
  it('borra una hora propia que no está aprobada', async () => {
    const sent = serveProjects(PROJECT_LEADER, {
      [`DELETE ${BASE}/time-entries/01999a00-0000-7000-8000-0000000e0702`]: () => noContent(),
    });
    await openHours();
    expect(await screen.findByText('Indique el ítem.')).toBeVisible();
    await userEvent.click(screen.getByRole('button', { name: /Borrar las horas/u }));
    await vi.waitFor(() => {
      expect(sent.some((request) => request.method === 'DELETE')).toBe(true);
    });
  });

  it('sin horas ni permiso, solo el estado vacío', async () => {
    serveProjects(PROJECT_MEMBER, {
      ...detailRoute({ can: CAN_NOTHING }),
      [`GET ${BASE}/time-entries`]: () => json({ data: [], total_hours: 0 }),
    });
    await openHours();
    expect(await screen.findByText('Sin horas registradas')).toBeVisible();
    expect(screen.queryByRole('button', { name: 'Registrar horas' })).toBeNull();
  });
});

describe('mis horas', () => {
  it('muestra las horas de todos los proyectos y registra en uno', async () => {
    serveProjects(PROJECT_LEADER);
    renderWithApi(
      <Screen>
        <MyHours />
      </Screen>,
    );
    expect(await screen.findByRole('heading', { name: 'Mis horas' })).toBeVisible();
    expect(await screen.findByText('Sus horas: 5,5 h')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Registrar horas' }));
    const dialog = await screen.findByRole('dialog');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Registrar' }));
    expect(within(dialog).getAllByText(/Escriba entre 0,25 y 24 horas/u).length).toBeGreaterThan(0);
  });
});

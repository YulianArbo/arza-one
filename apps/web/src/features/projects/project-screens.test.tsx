import { screen, within } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { Screen } from '../../test-support/core-fixtures';
import { json, noContent, renderWithApi } from '../../test-support/fake-api';
import {
  CONTRACT_ID,
  PROJECT_ID,
  PROJECT_LEADER,
  PROJECT_MEMBER,
  PROJECT_READER,
  detailRoute,
  serveProjects,
  CAN_NOTHING,
} from '../../test-support/project-fixtures';
import { ProjectDetailPanel } from './project-detail';
import { ProjectList } from './project-list';
import { NewProject } from './project-wizard';

// Pantallas de Proyectos (B26): la lista con los contratos vigentes sin proyecto, el asistente y la
// ficha con sus acciones según el estado y los permisos.

const push = vi.fn();

vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace: vi.fn(), push, back: vi.fn() }),
  usePathname: () => '/app/proyectos',
}));

beforeEach(() => {
  vi.stubGlobal('scrollTo', vi.fn());
});

afterEach(() => {
  vi.unstubAllGlobals();
});

function renderDetail(): void {
  renderWithApi(
    <Screen>
      <ProjectDetailPanel id={PROJECT_ID} />
    </Screen>,
  );
}

describe('lista de proyectos', () => {
  it('muestra cada proyecto con su avance y los contratos vigentes sin proyecto', async () => {
    serveProjects(PROJECT_LEADER);
    renderWithApi(
      <Screen>
        <ProjectList />
      </Screen>,
    );
    expect(await screen.findByRole('link', { name: 'PRY-2026-0001' })).toBeVisible();
    expect(
      within(screen.getByRole('table', { name: 'Proyectos' })).getByText('50 %'),
    ).toBeVisible();
    expect(screen.getByRole('link', { name: 'Nuevo proyecto' })).toBeVisible();
    const create = await screen.findByRole('link', {
      name: 'Crear el proyecto del contrato CTR-2026-0002',
    });
    expect(create).toHaveAttribute('href', `/app/proyectos/nuevo?contrato=${CONTRACT_ID}`);
  });
});

describe('cartera activa de Proyectos (B22B)', () => {
  it('destaca el primer proyecto en ejecución con su avance y lo enlaza', async () => {
    const sent = serveProjects(PROJECT_LEADER);
    renderWithApi(
      <Screen>
        <ProjectList />
      </Screen>,
    );
    const portfolio = await screen.findByRole('region', { name: 'Cartera activa' });
    expect(within(portfolio).getAllByRole('link').length).toBeGreaterThan(0);
    const meter = await screen.findByRole('meter', { name: /^Avance de / });
    expect(meter).toHaveAttribute('aria-valuenow', '50');
    expect(screen.getByRole('link', { name: 'Ver el proyecto PRY-2026-0001' })).toBeVisible();
    expect(sent.some((request) => request.search.includes('status=in_progress'))).toBe(true);
  });

  it('sin proyectos en ejecución no ocupa lugar', async () => {
    serveProjects(PROJECT_READER, {
      'GET /v1/projects': () => json({ data: [], next_cursor: null }),
    });
    renderWithApi(
      <Screen>
        <ProjectList />
      </Screen>,
    );
    expect(await screen.findByText('Todavía no hay proyectos')).toBeVisible();
    expect(screen.queryByRole('region', { name: 'Cartera activa' })).toBeNull();
  });
});

describe('lista de proyectos', () => {
  it('quien solo lee no ve «Nuevo proyecto» ni los contratos pendientes', async () => {
    const sent = serveProjects(PROJECT_READER, {
      'GET /v1/projects': () => json({ data: [], next_cursor: null }),
    });
    renderWithApi(
      <Screen>
        <ProjectList />
      </Screen>,
    );
    expect(await screen.findByText('Todavía no hay proyectos')).toBeVisible();
    expect(screen.queryByRole('link', { name: 'Nuevo proyecto' })).toBeNull();
    expect(sent.some((request) => request.path === '/v1/projects/options')).toBe(false);
  });
});

describe('asistente del proyecto', () => {
  it('desde el contrato llena los datos y lo envía con el contrato', async () => {
    const sent = serveProjects(PROJECT_LEADER, {
      'POST /v1/projects': () => json({ id: PROJECT_ID }, 201),
    });
    renderWithApi(
      <Screen>
        <NewProject contractId={CONTRACT_ID} />
      </Screen>,
    );
    expect(await screen.findByLabelText('Nombre del proyecto')).toHaveValue('Soporte anual');
    await userEvent.type(screen.getByLabelText('Presupuesto de horas'), '320,5');
    await userEvent.selectOptions(screen.getByLabelText('Líder del proyecto'), 'Carlos Ruiz');
    await userEvent.click(screen.getByRole('button', { name: 'Crear el proyecto' }));
    await vi.waitFor(() => {
      const created = sent.find((request) => request.method === 'POST');
      expect(created?.body).toMatchObject({
        contract_id: CONTRACT_ID,
        party_id: null,
        budget_hours: 320.5,
        budget_amount: '24000000.00',
        starts_on: '2026-11-01',
      });
    });
    expect(push).toHaveBeenCalledWith(`/app/proyectos/${PROJECT_ID}`);
  });
});

describe('asistente del proyecto', () => {
  it('sin contrato avisa de la autorización y pide el cliente antes de enviar', async () => {
    const sent = serveProjects(PROJECT_LEADER);
    renderWithApi(
      <Screen>
        <NewProject contractId={null} />
      </Screen>,
    );
    expect(await screen.findByText(/deberá pedir la autorización de la Dirección/u)).toBeVisible();
    await userEvent.click(screen.getByRole('button', { name: 'Crear el proyecto' }));
    const summary = await screen.findByRole('alert');
    expect(within(summary).getByText(/busque y elija el cliente/u)).toBeVisible();
    expect(within(summary).getByText(/Elija el líder del proyecto/u)).toBeVisible();
    expect(sent.some((request) => request.method === 'POST')).toBe(false);
  });
});

describe('ficha del proyecto', () => {
  it('muestra el resumen, las horas y los enlaces', async () => {
    serveProjects(PROJECT_LEADER);
    renderDetail();
    expect(await screen.findByRole('heading', { name: 'PRY-2026-0001' })).toBeVisible();
    expect(screen.getByText('En ejecución')).toBeVisible();
    expect(screen.getByRole('link', { name: 'CTR-2026-0001' })).toBeVisible();
    await userEvent.click(screen.getByRole('tab', { name: 'Horas' }));
    expect(await screen.findByText('Horas registradas: 5,5 h')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('tab', { name: 'Enlaces' }));
    expect(screen.getByRole('link', { name: /Repositorio del portal/u })).toHaveAttribute(
      'href',
      'https://git.example.com/portal',
    );
  });
});

describe('ficha del proyecto', () => {
  it('sin contrato vigente pide la autorización de la Dirección con su motivo', async () => {
    const sent = serveProjects(PROJECT_LEADER, {
      ...detailRoute({
        status: 'planning',
        contract: null,
        contract_status: null,
        started_at: null,
      }),
      [`POST /v1/projects/${PROJECT_ID}/actions/request-authorization`]: () => noContent(),
    });
    renderDetail();
    expect(await screen.findByText(/pida a la Dirección la autorización/u)).toBeVisible();
    expect(screen.queryByRole('button', { name: 'Iniciar el proyecto' })).toBeNull();
    await userEvent.click(
      screen.getByRole('button', { name: 'Pedir autorización a la Dirección' }),
    );
    const dialog = await screen.findByRole('dialog');
    await userEvent.type(within(dialog).getByLabelText('Motivo'), 'El cliente firma el lunes.');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Confirmar' }));
    await vi.waitFor(() => {
      const asked = sent.find((request) => request.path.endsWith('/request-authorization'));
      expect(asked?.body).toEqual({ reason: 'El cliente firma el lunes.' });
      expect(asked?.headers['If-Match']).toBe('"3"');
    });
  });
});

describe('ficha del proyecto', () => {
  it('con la autorización dada se inicia; en riesgo muestra el motivo', async () => {
    serveProjects(PROJECT_LEADER, {
      ...detailRoute({
        status: 'planning',
        contract: null,
        contract_status: null,
        started_at: null,
        authorization: {
          status: 'granted',
          reason: 'Urgente',
          note: null,
          decided_by: { id: CONTRACT_ID, name: 'Diego Director' },
          decided_at: '2026-11-01T15:00:00.000Z',
        },
      }),
    });
    renderDetail();
    expect(await screen.findByRole('button', { name: 'Iniciar el proyecto' })).toBeVisible();
  });
});

describe('ficha del proyecto', () => {
  it('un miembro del equipo no ve las acciones del proyecto ni el equipo para editar', async () => {
    serveProjects(PROJECT_MEMBER, {
      ...detailRoute({ can: { ...CAN_NOTHING, manage_items: true } }),
    });
    renderDetail();
    expect(await screen.findByRole('heading', { name: 'PRY-2026-0001' })).toBeVisible();
    expect(screen.queryByRole('link', { name: 'Editar' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Pausar' })).toBeNull();
    await userEvent.click(screen.getByRole('tab', { name: 'Equipo' }));
    expect(screen.queryByRole('button', { name: 'Agregar al equipo' })).toBeNull();
  });
});

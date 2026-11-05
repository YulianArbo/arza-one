import { screen, within } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { Screen } from '../../test-support/core-fixtures';
import { PERSON_SUMMARY } from '../../test-support/party-fixtures';
import { json, noContent, renderWithApi } from '../../test-support/fake-api';
import {
  ITEM_ID,
  PROJECT_ID,
  PROJECT_LEADER,
  PROJECT_READER,
  detailRoute,
  serveProjects,
} from '../../test-support/project-fixtures';
import { ProjectDetailPanel } from './project-detail';
import { ProjectList } from './project-list';
import { NewProject } from './project-wizard';

// Iteraciones, hitos, búsqueda de proyectos y asistente sin contrato (B26).

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

const BASE = `/v1/projects/${PROJECT_ID}`;
const CREATED = () => json({ id: ITEM_ID }, 201);
const PARTY = PERSON_SUMMARY;

async function openTab(name: string): Promise<void> {
  renderWithApi(
    <Screen>
      <ProjectDetailPanel id={PROJECT_ID} />
    </Screen>,
  );
  await userEvent.click(await screen.findByRole('tab', { name }));
}

describe('iteraciones', () => {
  it('inicia una iteración planeada', async () => {
    const planned = '01999a00-0000-7000-8000-0000000e0102';
    const sent = serveProjects(PROJECT_LEADER, {
      ...detailRoute({
        sprints: [
          {
            id: planned,
            name: 'Iteración 2',
            starts_on: '2026-11-16',
            ends_on: '2026-11-29',
            goal: null,
            status: 'planned',
            items: 0,
            version: 1,
          },
        ],
      }),
      [`POST ${BASE}/sprints/${planned}/actions/start`]: () => noContent(),
    });
    await openTab('Iteraciones');
    await userEvent.click(screen.getByRole('button', { name: 'Iniciar Iteración 2' }));
    await vi.waitFor(() => {
      expect(sent.some((request) => request.path.endsWith('/actions/start'))).toBe(true);
    });
  });
});

describe('iteraciones', () => {
  it('planea una iteración revisando las fechas', async () => {
    const sent = serveProjects(PROJECT_LEADER, { [`POST ${BASE}/sprints`]: CREATED });
    await openTab('Iteraciones');
    await userEvent.click(screen.getByRole('button', { name: 'Planear una iteración' }));
    const dialog = await screen.findByRole('dialog');
    await userEvent.type(within(dialog).getByLabelText('Inicio'), '2026-12-10');
    await userEvent.type(within(dialog).getByLabelText('Fin'), '2026-12-01');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Planear' }));
    expect(within(dialog).getAllByText(/posterior al inicio/u).length).toBeGreaterThan(0);
    await userEvent.clear(within(dialog).getByLabelText('Fin'));
    await userEvent.type(within(dialog).getByLabelText('Fin'), '2026-12-20');
    await userEvent.type(within(dialog).getByLabelText('Meta (opcional)'), 'Pagos en línea');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Planear' }));
    await vi.waitFor(() => {
      expect(sent.find((request) => request.path.endsWith('/sprints'))?.body).toEqual({
        name: 'Iteración 2',
        starts_on: '2026-12-10',
        ends_on: '2026-12-20',
        goal: 'Pagos en línea',
      });
    });
  });
});

describe('iteraciones', () => {
  it('sin iteraciones y sin permiso, solo el estado vacío', async () => {
    serveProjects(PROJECT_READER, {
      ...detailRoute({
        sprints: [],
        can: { update: false, manage_members: false, manage_items: false },
      }),
    });
    await openTab('Iteraciones');
    expect(screen.getByText('Sin iteraciones')).toBeVisible();
    expect(screen.queryByRole('button', { name: 'Planear una iteración' })).toBeNull();
  });
});

describe('hitos', () => {
  it('revisa el porcentaje y marca un hito cumplido', async () => {
    const sent = serveProjects(PROJECT_LEADER, {
      [`POST ${BASE}/milestones/01999a00-0000-7000-8000-0000000e0401/actions/complete`]: () =>
        noContent(),
    });
    await openTab('Hitos');
    await userEvent.click(screen.getByRole('button', { name: 'Marcar cumplido Anticipo' }));
    await vi.waitFor(() => {
      expect(sent.some((request) => request.path.endsWith('/actions/complete'))).toBe(true);
    });
    await userEvent.click(screen.getByRole('button', { name: 'Agregar un hito' }));
    const dialog = await screen.findByRole('dialog');
    await userEvent.type(within(dialog).getByLabelText('Porcentaje que se factura'), '150');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Agregar el hito' }));
    expect(within(dialog).getAllByText(/de 0 a 100/u).length).toBeGreaterThan(0);
    expect(within(dialog).getAllByText(/nombre del hito/u).length).toBeGreaterThan(0);
  });
});

describe('hitos', () => {
  it('sin hitos y sin permiso, solo el estado vacío', async () => {
    serveProjects(PROJECT_READER, {
      ...detailRoute({
        milestones: [],
        can: { update: false, manage_members: false, manage_items: false },
      }),
    });
    await openTab('Hitos');
    expect(screen.getByText('Sin hitos')).toBeVisible();
  });
});

describe('lista y asistente', () => {
  it('busca por texto y estado', async () => {
    const sent = serveProjects(PROJECT_READER);
    renderWithApi(
      <Screen>
        <ProjectList />
      </Screen>,
    );
    await userEvent.type(
      await screen.findByLabelText('Buscar por código, nombre o cliente'),
      'Portal',
    );
    await userEvent.selectOptions(screen.getByLabelText('Estado'), 'En riesgo');
    await userEvent.click(screen.getByRole('button', { name: 'Buscar' }));
    await vi.waitFor(() => {
      const found = sent.filter((request) => request.path === '/v1/projects');
      expect(found.at(-1)?.search).toContain('q=Portal');
      expect(found.at(-1)?.search).toContain('status=at_risk');
    });
  });
});

describe('lista y asistente', () => {
  it('sin contrato busca el cliente en Terceros y lo envía', async () => {
    const sent = serveProjects(PROJECT_LEADER, {
      'GET /v1/parties': () => json({ data: [PARTY], next_cursor: null }),
      'POST /v1/projects': CREATED,
    });
    renderWithApi(
      <Screen>
        <NewProject contractId={null} />
      </Screen>,
    );
    await userEvent.type(await screen.findByLabelText('Buscar el cliente en Terceros'), 'Andina');
    await userEvent.selectOptions(await screen.findByLabelText('Cliente'), PARTY.name);
    await userEvent.type(screen.getByLabelText('Nombre del proyecto'), 'Integración contable');
    await userEvent.type(screen.getByLabelText('Inicio'), '2026-11-01');
    await userEvent.type(screen.getByLabelText('Fin planeado'), '2027-01-31');
    await userEvent.type(screen.getByLabelText('Presupuesto de horas'), '100');
    await userEvent.selectOptions(screen.getByLabelText('Líder del proyecto'), 'Ana Pérez');
    await userEvent.click(screen.getByRole('button', { name: 'Crear el proyecto' }));
    await vi.waitFor(() => {
      const created = sent.find((request) => request.method === 'POST');
      expect(created?.body).toMatchObject({ contract_id: null, party_id: PARTY.id });
    });
  });
});

describe('quien solo lee', () => {
  it('ve pendientes, equipo y enlaces sin botones para cambiarlos', async () => {
    serveProjects(PROJECT_READER, {
      ...detailRoute({ can: { update: false, manage_members: false, manage_items: false } }),
    });
    await openTab('Pendientes');
    expect(await screen.findByText('#3 Descargar facturas')).toBeVisible();
    expect(screen.getAllByText('Pendientes').length).toBeGreaterThan(0);
    expect(screen.queryByRole('button', { name: /Editar/u })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Nuevo ítem' })).toBeNull();
    await userEvent.click(screen.getByRole('tab', { name: 'Equipo' }));
    expect(screen.queryByRole('button', { name: /Retirar/u })).toBeNull();
    await userEvent.click(screen.getByRole('tab', { name: 'Enlaces' }));
    expect(screen.getByRole('link', { name: /Repositorio del portal/u })).toBeVisible();
    expect(screen.queryByRole('button', { name: /Quitar/u })).toBeNull();
  });
});

describe('lista y asistente', () => {
  it('sin contratos pendientes no muestra ese recuadro', async () => {
    serveProjects(PROJECT_LEADER, {
      'GET /v1/projects/options': () => json({ contracts: [], people: [] }),
    });
    renderWithApi(
      <Screen>
        <ProjectList />
      </Screen>,
    );
    expect(await screen.findByRole('link', { name: 'PRY-2026-0001' })).toBeVisible();
    expect(screen.queryByText('Contratos vigentes sin proyecto')).toBeNull();
  });
});

describe('tarjetas y planeación', () => {
  it('una tarjeta sin épica ni responsable lo dice', async () => {
    serveProjects(PROJECT_LEADER, {
      [`GET ${BASE}/board`]: () =>
        json({
          sprint: null,
          items: [
            {
              id: ITEM_ID,
              number: 5,
              code: 'PRY-2026-0001-5',
              type: 'defect',
              parent: null,
              title: 'Error al descargar',
              description: null,
              acceptance_criteria: null,
              status: 'pending',
              priority: 'urgent',
              estimate_hours: null,
              assignee: null,
              sprint_id: null,
              review_url: null,
              test_note: null,
              done_at: null,
              version: 1,
            },
          ],
          refreshed_at: '2026-11-05T15:00:00.000Z',
        }),
    });
    await openTab('Tablero');
    expect(await screen.findByText('#5 Error al descargar')).toBeVisible();
    expect(screen.getByText('Sin asignar')).toBeVisible();
    expect(screen.getByText('Defecto')).toBeVisible();
  });
});

describe('tarjetas y planeación', () => {
  it('en planeación con contrato vigente invita a armar el proyecto e iniciarlo', async () => {
    serveProjects(PROJECT_LEADER, { ...detailRoute({ status: 'planning', started_at: null }) });
    renderWithApi(
      <Screen>
        <ProjectDetailPanel id={PROJECT_ID} />
      </Screen>,
    );
    expect(await screen.findByText(/Arme el equipo, los hitos/u)).toBeVisible();
    expect(screen.getByRole('button', { name: 'Iniciar el proyecto' })).toBeVisible();
  });
});

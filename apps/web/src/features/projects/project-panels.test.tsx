import { screen, within } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { Screen } from '../../test-support/core-fixtures';
import { apiError, json, noContent, renderWithApi } from '../../test-support/fake-api';
import {
  ITEM_ID,
  PROJECT_ID,
  PROJECT_LEADER,
  PROJECT_READER,
  TESTER,
  detailRoute,
  serveProjects,
} from '../../test-support/project-fixtures';
import { ProjectDetailPanel } from './project-detail';
import { EditProject } from './project-edit';

// Más caminos de las pantallas de Proyectos (B26): edición, enlaces, equipo, mensajes de estado,
// tablero vacío o pausado, errores de la API y edición de un ítem.

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

async function openTab(name: string): Promise<void> {
  renderWithApi(
    <Screen>
      <ProjectDetailPanel id={PROJECT_ID} />
    </Screen>,
  );
  await userEvent.click(await screen.findByRole('tab', { name }));
}

describe('edición del proyecto', () => {
  it('avisa lo que falta y guarda con la versión que se vio', async () => {
    const sent = serveProjects(PROJECT_LEADER, { [`PUT ${BASE}`]: () => noContent() });
    renderWithApi(
      <Screen>
        <EditProject id={PROJECT_ID} />
      </Screen>,
    );
    const name = await screen.findByLabelText('Nombre del proyecto');
    await userEvent.clear(name);
    await userEvent.click(screen.getByRole('button', { name: 'Guardar' }));
    expect(await screen.findByRole('alert')).toBeVisible();
    await userEvent.type(name, 'Portal renovado');
    await userEvent.click(screen.getByRole('button', { name: 'Guardar' }));
    await vi.waitFor(() => {
      const saved = sent.find((request) => request.method === 'PUT');
      expect(saved?.body).toMatchObject({ name: 'Portal renovado', budget_hours: 480.5 });
      expect(saved?.headers['If-Match']).toBe('"3"');
    });
    expect(push).toHaveBeenCalledWith(`/app/proyectos/${PROJECT_ID}`);
  });
});

describe('enlaces', () => {
  it('solo acepta https; agrega y quita', async () => {
    const sent = serveProjects(PROJECT_LEADER, {
      [`POST ${BASE}/links`]: CREATED,
      [`DELETE ${BASE}/links/01999a00-0000-7000-8000-0000000e0501`]: () => noContent(),
    });
    await openTab('Enlaces');
    await userEvent.click(screen.getByRole('button', { name: 'Agregar un enlace' }));
    const dialog = await screen.findByRole('dialog');
    await userEvent.type(within(dialog).getByLabelText('Nombre'), 'Pruebas');
    await userEvent.type(within(dialog).getByLabelText('Dirección'), 'http://inseguro.example');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Agregar el enlace' }));
    expect(within(dialog).getAllByText(/empiece por https/u).length).toBeGreaterThan(0);
    await userEvent.clear(within(dialog).getByLabelText('Dirección'));
    await userEvent.type(within(dialog).getByLabelText('Dirección'), 'https://pruebas.example');
    await userEvent.selectOptions(within(dialog).getByLabelText('Qué es'), 'Entorno de pruebas');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Agregar el enlace' }));
    await vi.waitFor(() => {
      expect(sent.find((request) => request.method === 'POST')?.body).toEqual({
        kind: 'test_environment',
        label: 'Pruebas',
        url: 'https://pruebas.example',
      });
    });
    await userEvent.click(
      screen.getByRole('button', { name: 'Quitar el enlace Repositorio del portal' }),
    );
    await vi.waitFor(() => {
      expect(sent.some((request) => request.method === 'DELETE')).toBe(true);
    });
  });
});

describe('enlaces', () => {
  it('sin enlaces y sin permiso, solo el estado vacío', async () => {
    serveProjects(PROJECT_READER, {
      ...detailRoute({
        links: [],
        can: { update: false, manage_members: false, manage_items: false },
      }),
    });
    await openTab('Enlaces');
    expect(screen.getByText('Sin enlaces')).toBeVisible();
    expect(screen.queryByRole('button', { name: 'Agregar un enlace' })).toBeNull();
  });
});

describe('equipo', () => {
  it('pide la persona y una dedicación válida antes de agregar', async () => {
    const sent = serveProjects(PROJECT_LEADER, { [`POST ${BASE}/members`]: CREATED });
    await openTab('Equipo');
    await userEvent.click(screen.getByRole('button', { name: 'Agregar al equipo' }));
    const dialog = await screen.findByRole('dialog');
    const allocation = within(dialog).getByLabelText('Dedicación en porcentaje');
    await userEvent.clear(allocation);
    await userEvent.type(allocation, '120');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Agregar al equipo' }));
    expect(within(dialog).getAllByText(/Elija la persona/u).length).toBeGreaterThan(1);
    expect(within(dialog).getAllByText(/de 1 a 100/u).length).toBeGreaterThan(0);
    await userEvent.selectOptions(await within(dialog).findByLabelText('Persona'), TESTER.name);
    await userEvent.selectOptions(within(dialog).getByLabelText('Rol'), 'Pruebas');
    await userEvent.clear(allocation);
    await userEvent.type(allocation, '40');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Agregar al equipo' }));
    await vi.waitFor(() => {
      expect(sent.find((request) => request.method === 'POST')?.body).toEqual({
        user_id: TESTER.id,
        role: 'testing',
        allocation_pct: 40,
      });
    });
  });
});

describe('mensajes de estado', () => {
  it('en riesgo muestra el motivo y deja pausar con su motivo', async () => {
    const sent = serveProjects(PROJECT_LEADER, {
      ...detailRoute({ status: 'at_risk', status_reason: 'Falta el acceso al servidor.' }),
      [`POST ${BASE}/actions/pause`]: () => noContent(),
    });
    renderWithApi(
      <Screen>
        <ProjectDetailPanel id={PROJECT_ID} />
      </Screen>,
    );
    expect(await screen.findByText(/Falta el acceso al servidor/u)).toBeVisible();
    expect(screen.getByRole('button', { name: 'Reanudar' })).toBeVisible();
    await userEvent.click(screen.getByRole('button', { name: 'Pausar' }));
    const dialog = await screen.findByRole('dialog');
    await userEvent.type(within(dialog).getByLabelText('Motivo'), 'Vacaciones del cliente.');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Confirmar' }));
    await vi.waitFor(() => {
      const paused = sent.find((request) => request.path.endsWith('/actions/pause'));
      expect(paused?.body).toEqual({ reason: 'Vacaciones del cliente.' });
    });
  });
});

describe('mensajes de estado', () => {
  it('cuenta que la Dirección no autorizó y que puede pedirlo de nuevo', async () => {
    serveProjects(PROJECT_LEADER, {
      ...detailRoute({
        status: 'planning',
        contract: null,
        contract_status: null,
        started_at: null,
        authorization: {
          status: 'denied',
          reason: 'Urgente',
          note: 'Primero firme el contrato.',
          decided_by: null,
          decided_at: '2026-11-01T15:00:00.000Z',
        },
      }),
    });
    renderWithApi(
      <Screen>
        <ProjectDetailPanel id={PROJECT_ID} />
      </Screen>,
    );
    expect(await screen.findByText(/Primero firme el contrato/u)).toBeVisible();
    expect(screen.getByRole('button', { name: 'Pedir autorización a la Dirección' })).toBeVisible();
  });
});

describe('mensajes de estado', () => {
  it('con la autorización pedida espera a la Dirección sin botones de inicio', async () => {
    serveProjects(PROJECT_LEADER, {
      ...detailRoute({
        status: 'planning',
        contract: null,
        contract_status: null,
        started_at: null,
        authorization: {
          status: 'requested',
          reason: 'Urgente',
          note: null,
          decided_by: null,
          decided_at: null,
        },
      }),
    });
    renderWithApi(
      <Screen>
        <ProjectDetailPanel id={PROJECT_ID} />
      </Screen>,
    );
    expect(await screen.findByText(/Esperando la autorización/u)).toBeVisible();
    expect(screen.queryByRole('button', { name: 'Iniciar el proyecto' })).toBeNull();
    expect(screen.queryByRole('button', { name: /Pedir autorización/u })).toBeNull();
  });
});

describe('tablero', () => {
  it('pausado no deja mover; vacío explica qué hacer', async () => {
    serveProjects(PROJECT_LEADER, {
      ...detailRoute({ status: 'paused', status_reason: 'Espera del cliente.' }),
      [`GET ${BASE}/board`]: () =>
        json({ sprint: null, items: [], refreshed_at: '2026-11-05T15:00:00.000Z' }),
    });
    await openTab('Tablero');
    expect(await screen.findByText('El tablero está vacío')).toBeVisible();
    expect(screen.getByText(/se mueve cuando el proyecto está en ejecución/u)).toBeVisible();
    expect(screen.getByText(/Sin iteración en curso/u)).toBeVisible();
  });
});

describe('tablero', () => {
  it('mover hacia atrás no pide evidencia; un error de la API se muestra', async () => {
    const sent = serveProjects(PROJECT_LEADER, {
      [`POST ${BASE}/items/${ITEM_ID}/actions/move`]: () =>
        apiError(409, 'VERSION_CONFLICT', 'Otra persona cambió el ítem. Recargue.'),
    });
    await openTab('Tablero');
    await userEvent.click(
      await screen.findByRole('button', { name: 'Mover #2 Consultar facturas a otra columna' }),
    );
    await userEvent.click(await screen.findByRole('menuitem', { name: 'En curso' }));
    expect(await screen.findByText(/Otra persona cambió el ítem/u)).toBeVisible();
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(sent.find((request) => request.method === 'POST')?.body).toEqual({
      status: 'in_progress',
      review_url: null,
      test_note: null,
    });
  });
});

describe('lista de pendientes', () => {
  it('edita un ítem y revisa la estimación', async () => {
    const sent = serveProjects(PROJECT_LEADER, {
      [`PUT ${BASE}/items/${ITEM_ID}`]: () => noContent(),
    });
    await openTab('Pendientes');
    await userEvent.click(
      await screen.findByRole('button', { name: 'Editar #2 Consultar facturas' }),
    );
    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).queryByLabelText('Tipo')).toBeNull();
    const estimate = within(dialog).getByLabelText('Estimación en horas (opcional)');
    await userEvent.clear(estimate);
    await userEvent.type(estimate, '2000');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Guardar' }));
    expect(within(dialog).getAllByText(/de 0,5 a 999/u).length).toBeGreaterThan(0);
    await userEvent.clear(estimate);
    await userEvent.type(estimate, '6,5');
    await userEvent.selectOptions(within(dialog).getByLabelText('Prioridad'), 'Urgente');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Guardar' }));
    await vi.waitFor(() => {
      const saved = sent.find((request) => request.method === 'PUT');
      expect(saved?.body).toMatchObject({ estimate_hours: 6.5, priority: 'urgent' });
      expect(saved?.headers['If-Match']).toBe('"4"');
    });
  });
});

describe('lista de pendientes', () => {
  it('vacía explica cómo empezar', async () => {
    serveProjects(PROJECT_LEADER, {
      [`GET ${BASE}/items`]: () => json({ data: [] }),
    });
    await openTab('Pendientes');
    expect(await screen.findByText('La lista de pendientes está vacía')).toBeVisible();
  });
});

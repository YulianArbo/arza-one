import { screen, within } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { Screen } from '../../test-support/core-fixtures';
import { noContent, renderWithApi } from '../../test-support/fake-api';
import {
  ITEM_ID,
  PROJECT_ID,
  PROJECT_LEADER,
  PROJECT_READER,
  SPRINT_ID,
  detailRoute,
  serveProjects,
} from '../../test-support/project-fixtures';
import { ProjectDetailPanel } from './project-detail';

// Tablero, lista de pendientes e iteraciones de un proyecto (B26): «Mover a» solo ofrece los pasos
// posibles, terminar pide la revisión de código y las pruebas, y un ítem sin criterios lo marca la
// lista.

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

async function openTab(name: string): Promise<void> {
  renderWithApi(
    <Screen>
      <ProjectDetailPanel id={PROJECT_ID} />
    </Screen>,
  );
  await userEvent.click(await screen.findByRole('tab', { name }));
}

const MOVE = `POST /v1/projects/${PROJECT_ID}/items/${ITEM_ID}/actions/move`;

describe('tablero', () => {
  it('muestra una columna por estado; «Mover a» no se salta columnas', async () => {
    serveProjects(PROJECT_LEADER);
    await openTab('Tablero');
    const testing = await screen.findByRole('region', { name: /En pruebas/u });
    expect(within(testing).getByText('#2 Consultar facturas')).toBeVisible();
    expect(screen.getByText(/Iteración 1/u)).toBeVisible();
    await userEvent.click(
      screen.getByRole('button', { name: 'Mover #2 Consultar facturas a otra columna' }),
    );
    const options = (await screen.findAllByRole('menuitem')).map((option) => option.textContent);
    expect(options).toEqual(['Pendiente', 'En curso', 'En revisión', 'Terminado']);
  });
});

describe('tablero', () => {
  it('terminar pide el enlace a la revisión de código y las pruebas', async () => {
    const sent = serveProjects(PROJECT_LEADER, { [MOVE]: () => noContent() });
    await openTab('Tablero');
    await userEvent.click(
      await screen.findByRole('button', { name: 'Mover #2 Consultar facturas a otra columna' }),
    );
    await userEvent.click(await screen.findByRole('menuitem', { name: 'Terminado' }));
    const dialog = await screen.findByRole('dialog');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Terminar' }));
    expect(within(dialog).getAllByText(/https:\/\//u).length).toBeGreaterThan(0);
    await userEvent.type(
      within(dialog).getByLabelText('Enlace a la revisión de código'),
      'https://git.example.com/portal/pull/12',
    );
    await userEvent.type(within(dialog).getByLabelText('Pruebas hechas'), 'Pruebas manuales.');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Terminar' }));
    await vi.waitFor(() => {
      const move = sent.find((request) => request.path.endsWith('/actions/move'));
      expect(move?.body).toEqual({
        status: 'done',
        review_url: 'https://git.example.com/portal/pull/12',
        test_note: 'Pruebas manuales.',
      });
      expect(move?.headers['If-Match']).toBe('"4"');
    });
  });
});

describe('tablero', () => {
  it('quien solo lee el proyecto no puede mover tarjetas', async () => {
    serveProjects(PROJECT_READER, {
      ...detailRoute({ can: { update: false, manage_members: false, manage_items: false } }),
    });
    await openTab('Tablero');
    expect(await screen.findByText(/lo mueve el equipo del proyecto/u)).toBeVisible();
    expect(screen.queryByRole('button', { name: /Mover/u })).toBeNull();
  });
});

describe('lista de pendientes', () => {
  it('marca los ítems sin criterios y lleva uno a la iteración', async () => {
    const sent = serveProjects(PROJECT_LEADER, {
      [`POST /v1/projects/${PROJECT_ID}/items/01999a00-0000-7000-8000-0000000e0202/actions/plan`]:
        () => noContent(),
    });
    await openTab('Pendientes');
    expect(await screen.findByText('#3 Descargar facturas')).toBeVisible();
    expect(screen.getAllByText('Sin criterios de aceptación')).toHaveLength(1);
    await userEvent.selectOptions(
      screen.getByLabelText('Iteración de #3 Descargar facturas'),
      'Iteración 1',
    );
    await vi.waitFor(() => {
      const plan = sent.find((request) => request.path.endsWith('/actions/plan'));
      expect(plan?.body).toEqual({ sprint_id: SPRINT_ID });
    });
  });
});

describe('lista de pendientes', () => {
  it('crea un ítem con sus criterios de aceptación', async () => {
    const sent = serveProjects(PROJECT_LEADER, {
      [`POST /v1/projects/${PROJECT_ID}/items`]: () =>
        new Response(JSON.stringify({ id: ITEM_ID }), { status: 201 }),
    });
    await openTab('Pendientes');
    await userEvent.click(await screen.findByRole('button', { name: 'Nuevo ítem' }));
    const dialog = await screen.findByRole('dialog');
    await userEvent.selectOptions(within(dialog).getByLabelText('Tipo'), 'Tarea');
    await userEvent.type(within(dialog).getByLabelText('Título'), 'Diseñar la consulta');
    await userEvent.type(
      within(dialog).getByLabelText('Criterios de aceptación'),
      'Responde en menos de 2 segundos.',
    );
    await userEvent.click(within(dialog).getByRole('button', { name: 'Crear el ítem' }));
    await vi.waitFor(() => {
      const created = sent.find((request) => request.method === 'POST');
      expect(created?.body).toMatchObject({
        type: 'task',
        title: 'Diseñar la consulta',
        acceptance_criteria: 'Responde en menos de 2 segundos.',
        parent_id: null,
      });
    });
  });
});

describe('iteraciones, hitos y equipo', () => {
  it('cierra la iteración en curso y agrega un hito con su porcentaje', async () => {
    const sent = serveProjects(PROJECT_LEADER, {
      [`POST /v1/projects/${PROJECT_ID}/sprints/${SPRINT_ID}/actions/close`]: () => noContent(),
      [`POST /v1/projects/${PROJECT_ID}/milestones`]: () =>
        new Response(JSON.stringify({ id: ITEM_ID }), { status: 201 }),
    });
    await openTab('Iteraciones');
    await userEvent.click(await screen.findByRole('button', { name: 'Cerrar Iteración 1' }));
    await vi.waitFor(() => {
      expect(sent.some((request) => request.path.endsWith('/actions/close'))).toBe(true);
    });
    await userEvent.click(screen.getByRole('tab', { name: 'Hitos' }));
    await userEvent.click(screen.getByRole('button', { name: 'Agregar un hito' }));
    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByText(/Ya están asignados 30 %/u)).toBeVisible();
    await userEvent.type(within(dialog).getByLabelText('Nombre'), 'Entrega final');
    await userEvent.type(within(dialog).getByLabelText('Fecha comprometida'), '2027-02-15');
    await userEvent.type(within(dialog).getByLabelText('Porcentaje que se factura'), '70');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Agregar el hito' }));
    await vi.waitFor(() => {
      const created = sent.find((request) => request.path.endsWith('/milestones'));
      expect(created?.body).toEqual({
        name: 'Entrega final',
        due_on: '2027-02-15',
        billing_pct: 70,
      });
    });
  });
});

describe('iteraciones, hitos y equipo', () => {
  it('retirar a alguien del equipo pide confirmación', async () => {
    const memberPath = `/v1/projects/${PROJECT_ID}/members/01999a00-0000-7000-8000-0000000e0302`;
    const sent = serveProjects(PROJECT_LEADER, { [`DELETE ${memberPath}`]: () => noContent() });
    await openTab('Equipo');
    await userEvent.click(await screen.findByRole('button', { name: 'Retirar a Carlos Ruiz' }));
    await userEvent.click(await screen.findByRole('button', { name: 'Sí, retirar' }));
    await vi.waitFor(() => {
      expect(sent.some((request) => request.method === 'DELETE')).toBe(true);
    });
  });
});

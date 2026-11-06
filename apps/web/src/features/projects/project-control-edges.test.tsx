import { screen, within } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { Screen } from '../../test-support/core-fixtures';
import { json, renderWithApi } from '../../test-support/fake-api';
import {
  PROJECT_ID,
  PROJECT_LEADER,
  detailRoute,
  serveProjects,
} from '../../test-support/project-fixtures';
import { ProjectDetailPanel } from './project-detail';

// Control del proyecto (B27), casos de borde: lo que falta al resolver o al registrar, las listas
// vacías y el proyecto cerrado, que solo se consulta.

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
const EMPTY = () => json({ data: [] });

async function openTab(name: string): Promise<void> {
  renderWithApi(
    <Screen>
      <ProjectDetailPanel id={PROJECT_ID} />
    </Screen>,
  );
  await userEvent.click(await screen.findByRole('tab', { name }));
}

describe('incidentes: lo que falta', () => {
  it('resolver sin datos dice qué falta y no envía nada', async () => {
    const sent = serveProjects(PROJECT_LEADER);
    await openTab('Incidentes');
    await userEvent.click(await screen.findByRole('button', { name: 'Resolver' }));
    const dialog = await screen.findByRole('dialog');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Resolver' }));
    expect(within(dialog).getAllByText(/Escriba la fecha y la hora/u).length).toBeGreaterThan(0);
    expect(within(dialog).getAllByText(/Escriba la causa raíz/u).length).toBeGreaterThan(0);
    expect(within(dialog).getAllByText(/Escriba qué se hizo/u).length).toBeGreaterThan(0);
    expect(sent.some((request) => request.path.endsWith('/resolve'))).toBe(false);
  });

  it('sin incidentes muestra el aviso; cerrado, no deja registrar', async () => {
    serveProjects(PROJECT_LEADER, {
      ...detailRoute({ status: 'closed' }),
      [`GET ${BASE}/incidents`]: EMPTY,
    });
    await openTab('Incidentes');
    expect(await screen.findByText('Sin incidentes')).toBeVisible();
    expect(screen.queryByRole('button', { name: 'Registrar un incidente' })).toBeNull();
  });
});

describe('riesgos: lo que falta', () => {
  it('sin descripción no guarda; actualizar trae los valores del riesgo', async () => {
    const sent = serveProjects(PROJECT_LEADER);
    await openTab('Riesgos');
    await userEvent.click(await screen.findByRole('button', { name: 'Registrar un riesgo' }));
    const dialog = await screen.findByRole('dialog');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Guardar el riesgo' }));
    expect(within(dialog).getAllByText(/Describa el riesgo/u).length).toBeGreaterThan(0);
    expect(sent.some((request) => request.method === 'POST')).toBe(false);
    await userEvent.keyboard('{Escape}');
    await userEvent.click(screen.getByRole('button', { name: 'Actualizar' }));
    const update = await screen.findByRole('dialog');
    expect(within(update).getByLabelText('Riesgo')).toHaveValue(
      'Cambia la interfaz del proveedor de pagos.',
    );
  });

  it('sin riesgos muestra el aviso', async () => {
    serveProjects(PROJECT_LEADER, { [`GET ${BASE}/risks`]: EMPTY });
    await openTab('Riesgos');
    expect(await screen.findByText('Sin riesgos registrados')).toBeVisible();
  });
});

describe('entregables: todos los datos', () => {
  it('envía versión, hito, enlace y descripción', async () => {
    const sent = serveProjects(PROJECT_LEADER, {
      [`POST ${BASE}/deliverables`]: () => json({ id: PROJECT_ID }, 201),
    });
    await openTab('Entregables');
    await userEvent.click(await screen.findByRole('button', { name: 'Agregar un entregable' }));
    const dialog = await screen.findByRole('dialog');
    await userEvent.type(within(dialog).getByLabelText('Nombre'), 'Manual de usuario');
    await userEvent.type(within(dialog).getByLabelText('Versión'), '1.0');
    await userEvent.selectOptions(within(dialog).getByLabelText('Hito'), 'Anticipo');
    await userEvent.type(within(dialog).getByLabelText('Dónde está'), 'https://repo.example/doc');
    await userEvent.type(within(dialog).getByLabelText('Qué se entrega'), 'El manual completo.');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Guardar' }));
    await vi.waitFor(() => {
      expect(sent.find((request) => request.method === 'POST')?.body).toEqual({
        name: 'Manual de usuario',
        description: 'El manual completo.',
        version_label: '1.0',
        milestone_id: '01999a00-0000-7000-8000-0000000e0401',
        evidence_url: 'https://repo.example/doc',
      });
    });
  });

  it('cerrado y sin entregables: solo el aviso', async () => {
    serveProjects(PROJECT_LEADER, {
      ...detailRoute({ status: 'closed' }),
      [`GET ${BASE}/deliverables`]: EMPTY,
    });
    await openTab('Entregables');
    expect(await screen.findByText('Sin entregables')).toBeVisible();
    expect(screen.queryByRole('button', { name: 'Agregar un entregable' })).toBeNull();
  });
});

describe('horas: día futuro', () => {
  it('no deja registrar horas de un día que no ha pasado', async () => {
    const sent = serveProjects(PROJECT_LEADER);
    await openTab('Horas');
    await userEvent.click(await screen.findByRole('button', { name: 'Registrar horas' }));
    const dialog = await screen.findByRole('dialog');
    const date = within(dialog).getByLabelText('Día trabajado');
    await userEvent.clear(date);
    await userEvent.type(date, '2099-01-01');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Registrar' }));
    expect(within(dialog).getAllByText(/un día que ya pasó/u).length).toBeGreaterThan(0);
    expect(sent.some((request) => request.method === 'POST')).toBe(false);
  });
});

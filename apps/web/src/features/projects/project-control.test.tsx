import { screen, within } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { Screen } from '../../test-support/core-fixtures';
import { json, noContent, renderWithApi } from '../../test-support/fake-api';
import {
  INCIDENT_ID,
  PROJECT_ID,
  PROJECT_LEADER,
  RISK_ID,
  detailRoute,
  serveProjects,
} from '../../test-support/project-fixtures';
import { ProjectDetailPanel } from './project-detail';

// Control del proyecto (B27): riesgos con su nivel, liberaciones con informe de pruebas,
// incidentes, indicadores y el cierre.

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
const CREATED = () => json({ id: RISK_ID }, 201);

async function openTab(name: string): Promise<void> {
  renderWithApi(
    <Screen>
      <ProjectDetailPanel id={PROJECT_ID} />
    </Screen>,
  );
  await userEvent.click(await screen.findByRole('tab', { name }));
}

describe('riesgos', () => {
  it('calcula el nivel y registra el riesgo', async () => {
    const sent = serveProjects(PROJECT_LEADER, { [`POST ${BASE}/risks`]: CREATED });
    await openTab('Riesgos');
    expect(await screen.findByText('Alto (20)')).toBeVisible();
    await userEvent.click(screen.getByRole('button', { name: 'Registrar un riesgo' }));
    const dialog = await screen.findByRole('dialog');
    await userEvent.type(within(dialog).getByLabelText('Riesgo'), 'Rotación del equipo.');
    await userEvent.selectOptions(within(dialog).getByLabelText(/Probabilidad/u), '5');
    await userEvent.selectOptions(within(dialog).getByLabelText(/Impacto/u), '4');
    expect(within(dialog).getByText('Alto')).toBeVisible();
    await userEvent.click(within(dialog).getByRole('button', { name: 'Guardar el riesgo' }));
    await vi.waitFor(() => {
      const post = sent.find((request) => request.method === 'POST');
      expect(post?.body).toMatchObject({ probability: 5, impact: 4, status: 'open' });
    });
  });
});

describe('liberaciones', () => {
  it('exige el informe de pruebas y registra la versión', async () => {
    const sent = serveProjects(PROJECT_LEADER, { [`POST ${BASE}/releases`]: CREATED });
    await openTab('Liberaciones');
    await userEvent.click(await screen.findByRole('button', { name: 'Registrar una liberación' }));
    const dialog = await screen.findByRole('dialog');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Registrar la liberación' }));
    expect(within(dialog).getAllByText(/informe de pruebas en PDF/u).length).toBeGreaterThan(0);
    await userEvent.type(within(dialog).getByLabelText('Versión'), '1.1.0');
    await userEvent.type(within(dialog).getByLabelText('Fecha de la liberación'), '2026-11-05');
    await userEvent.type(within(dialog).getByLabelText('Qué cambia'), 'Descarga de facturas.');
    await userEvent.selectOptions(
      within(dialog).getByLabelText('Informe de pruebas (PDF)'),
      await within(dialog).findByRole('option', { name: 'informe.pdf' }),
    );
    await userEvent.click(within(dialog).getByRole('button', { name: 'Registrar la liberación' }));
    await vi.waitFor(() => {
      expect(sent.find((request) => request.method === 'POST')?.body).toMatchObject({
        version_label: '1.1.0',
        environment: 'test',
      });
    });
  });
});

describe('incidentes', () => {
  it('registra un incidente y lo resuelve con su causa', async () => {
    const sent = serveProjects(PROJECT_LEADER, {
      [`POST ${BASE}/incidents`]: CREATED,
      [`POST ${BASE}/incidents/${INCIDENT_ID}/actions/resolve`]: () => noContent(),
    });
    await openTab('Incidentes');
    expect(await screen.findByText('Con datos personales')).toBeVisible();
    await userEvent.click(screen.getByRole('button', { name: 'Registrar un incidente' }));
    const dialog = await screen.findByRole('dialog');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Registrar el incidente' }));
    expect(within(dialog).getAllByText(/título corto/u).length).toBeGreaterThan(0);
    await userEvent.keyboard('{Escape}');
    await userEvent.click(screen.getByRole('button', { name: 'Resolver' }));
    const resolve = await screen.findByRole('dialog');
    await userEvent.type(within(resolve).getByLabelText(/Cuándo se resolvió/u), '2026-11-05T10:30');
    await userEvent.type(within(resolve).getByLabelText('Causa raíz'), 'Memoria agotada.');
    await userEvent.type(within(resolve).getByLabelText(/Qué se hizo/u), 'Límite y alerta.');
    await userEvent.click(within(resolve).getByRole('button', { name: 'Resolver' }));
    await vi.waitFor(() => {
      expect(sent.some((request) => request.path.endsWith('/resolve'))).toBe(true);
    });
  });
});

describe('indicadores', () => {
  it('muestra avance, horas, desviación y rentabilidad', async () => {
    serveProjects(PROJECT_LEADER);
    await openTab('Indicadores');
    expect(await screen.findByText('40 puntos adelantado')).toBeVisible();
    expect(screen.getAllByText('Horas del proyecto').length).toBeGreaterThan(0);
    expect(screen.getByText('97 % del ingreso')).toBeVisible();
  });
});

describe('cierre y control', () => {
  it('pasa a cierre, cierra con lecciones y configura el control', async () => {
    const sent = serveProjects(PROJECT_LEADER, {
      ...detailRoute({ status: 'closing' }),
      [`POST ${BASE}/actions/close`]: () => noContent(),
      [`PUT ${BASE}/control-settings`]: () => noContent(),
    });
    await openTab('Resumen');
    await userEvent.click(await screen.findByRole('button', { name: 'Cerrar el proyecto' }));
    const close = await screen.findByRole('dialog');
    await userEvent.type(within(close).getByLabelText('Lecciones aprendidas'), 'Probar antes.');
    await userEvent.click(within(close).getByRole('button', { name: 'Cerrar el proyecto' }));
    await vi.waitFor(() => {
      expect(sent.some((request) => request.path.endsWith('/actions/close'))).toBe(true);
    });
    await userEvent.click(await screen.findByRole('button', { name: 'Configurar el control' }));
    const settings = await screen.findByRole('dialog');
    await userEvent.click(within(settings).getByLabelText(/aceptación tácita/u));
    await userEvent.click(within(settings).getByRole('button', { name: 'Guardar' }));
    expect(within(settings).getAllByText(/Indique la cláusula/u).length).toBeGreaterThan(0);
    await userEvent.type(within(settings).getByLabelText(/Cláusula/u), 'Cláusula 9.2');
    await userEvent.click(within(settings).getByRole('button', { name: 'Guardar' }));
    await vi.waitFor(() => {
      expect(sent.find((request) => request.method === 'PUT')?.body).toMatchObject({
        tacit_acceptance: true,
        tacit_clause: 'Cláusula 9.2',
      });
    });
  });
});

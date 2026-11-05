import { screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { serveCrm } from '../../test-support/crm-fixtures';
import { apiError, json, renderWithApi } from '../../test-support/fake-api';
import { notice, permissions } from '../../test-support/ntf-fixtures';
import { taskSummary } from '../../test-support/wf-fixtures';
import { HomeDashboard } from './home-dashboard';

const NOTICES = { 'GET /v1/me/notifications': () => json({ items: [notice()], unread_count: 1 }) };
const TASKS = {
  'GET /v1/tasks/mine': () => json({ data: [taskSummary()], next_cursor: null }),
  ...NOTICES,
};

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('tablero de Inicio con datos reales (B22A)', () => {
  it('muestra tareas, comercial y avisos a quien puede verlos', async () => {
    serveCrm(permissions(['wf.task.work', 'crm.report.read']), TASKS);
    renderWithApi(<HomeDashboard />);
    expect(
      await screen.findByRole('link', { name: 'Borrador: Compra de portátiles' }),
    ).toBeVisible();
    const open = screen.getByRole('heading', { name: 'Tareas abiertas' }).closest('section');
    expect(open).toHaveTextContent('Tareas abiertas1');
    const funnel = await screen.findByRole('heading', { name: 'Embudo abierto' });
    expect(funnel.closest('section')).toHaveTextContent(/25\.000\.000/);
    expect(screen.getByRole('list', { name: 'Embudo abierto por etapa' })).toBeVisible();
    const notices = screen.getByRole('heading', { name: 'Avisos recientes' }).closest('section');
    expect(within(notices ?? document.body).getByText(notice().title)).toBeVisible();
  });

  it('sin permisos de tareas ni comercial no las pide y lo explica', async () => {
    const sent = serveCrm(permissions([]), NOTICES);
    renderWithApi(<HomeDashboard />);
    expect(await screen.findByText(/Su rol todavía no tiene indicadores/)).toBeVisible();
    expect(sent.some((request) => request.path === '/v1/tasks/mine')).toBe(false);
    expect(sent.some((request) => request.path === '/v1/crm/reports/funnel')).toBe(false);
  });

  it('sin tareas muestra el estado vacío y, si falla el comercial, el error con reintento', async () => {
    serveCrm(permissions(['wf.task.work', 'crm.report.read']), {
      'GET /v1/tasks/mine': () => json({ data: [], next_cursor: null }),
      'GET /v1/crm/reports/funnel': () => apiError(500, 'internal', 'No pudimos cargar el embudo.'),
      ...NOTICES,
    });
    renderWithApi(<HomeDashboard />);
    expect(await screen.findByText(/No tiene tareas pendientes/)).toBeVisible();
    expect(await screen.findByText('No pudimos cargar el embudo.')).toBeVisible();
    expect(screen.getByRole('button', { name: /Reintentar/ })).toBeVisible();
  });
});

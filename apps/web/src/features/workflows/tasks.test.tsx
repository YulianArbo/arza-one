import { screen, waitFor, within } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import type { JSX, ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  SESSION,
  apiError,
  json,
  mockApi,
  noContent,
  renderWithApi,
} from '../../test-support/fake-api';
import {
  INSTANCE_ID,
  TASK_ID,
  WF_ADMIN,
  WORKER,
  taskSummary,
  taskView,
} from '../../test-support/wf-fixtures';
import { RequireSession } from '../session/session-provider';
import { TaskDetail } from './task-detail';
import { TaskInbox } from './task-inbox';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace: vi.fn(), push: vi.fn() }),
  usePathname: () => '/app/mis-tareas',
}));

function Screen({ children }: { readonly children: ReactNode }): JSX.Element {
  return <RequireSession kind="internal">{children}</RequireSession>;
}

function serve(
  permissions: object,
  extra: Record<string, Parameters<typeof mockApi>[0][string]> = {},
) {
  return mockApi({
    'GET /v1/auth/session': () => json(SESSION),
    'GET /v1/me/permissions': () => json(permissions),
    'GET /v1/tasks/mine': () => json({ data: [taskSummary()], next_cursor: null }),
    [`GET /v1/tasks/${TASK_ID}`]: () => json(taskView()),
    ...extra,
  });
}

beforeEach(() => {
  vi.stubGlobal('scrollTo', vi.fn());
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('bandeja «Mis tareas»', () => {
  it('muestra las tareas con su estado, prioridad, vencimiento y motivo', async () => {
    serve(WORKER);
    renderWithApi(
      <Screen>
        <TaskInbox />
      </Screen>,
    );
    const link = await screen.findByRole('link', { name: 'Borrador: Compra de portátiles' });
    expect(link).toHaveAttribute('href', `/app/mis-tareas/${TASK_ID}`);
    const row = link.closest('tr');
    if (row === null) throw new Error('sin fila');
    expect(within(row).getByText('Pendiente')).toBeInTheDocument();
    expect(within(row).getByText('Alta')).toBeInTheDocument();
    expect(within(row).getByText('Asignada a usted')).toBeInTheDocument();
    expect(within(row).getByText('16/10/2026, 4:00 p. m.')).toBeInTheDocument();
    expect(screen.queryByText('Ver el tablero de todas las tareas')).not.toBeInTheDocument();
  });
});

describe('vistas de la bandeja', () => {
  it('cambia entre abiertas, vencidas y cerradas, con su mensaje cuando no hay', async () => {
    const sent = serve(WORKER, {
      'GET /v1/tasks/mine': (request) =>
        json({ data: request.search.includes('open') ? [taskSummary()] : [], next_cursor: null }),
    });
    renderWithApi(
      <Screen>
        <TaskInbox />
      </Screen>,
    );
    await screen.findByText('Borrador: Compra de portátiles');
    await userEvent.click(screen.getByRole('button', { name: 'Vencidas' }));
    expect(await screen.findByText('No tiene tareas vencidas.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Vencidas' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    await userEvent.click(screen.getByRole('button', { name: 'Cerradas' }));
    expect(await screen.findByText('Todavía no ha cerrado tareas.')).toBeInTheDocument();
    expect(sent.map((r) => r.search)).toEqual(
      expect.arrayContaining(['?view=overdue', '?view=closed']),
    );
  });
});

describe('bandeja: tablero y errores', () => {
  it('quien ve todas las tareas tiene el enlace al tablero; un error ofrece reintentar', async () => {
    serve(WF_ADMIN, {
      'GET /v1/tasks/mine': () => apiError(500, 'INTERNAL_ERROR', 'Falla inesperada.'),
    });
    renderWithApi(
      <Screen>
        <TaskInbox />
      </Screen>,
    );
    expect(await screen.findByRole('button', { name: /Reintentar/ })).toBeInTheDocument();
    expect(
      screen.getByRole('link', { name: 'Ver el tablero de todas las tareas' }),
    ).toBeInTheDocument();
  });
});

describe('tarea de acción', () => {
  it('completa con la acción elegida; la que no cumple la condición queda deshabilitada', async () => {
    const sent = serve(WORKER, {
      [`POST /v1/tasks/${TASK_ID}/actions/complete`]: () => noContent(),
    });
    renderWithApi(
      <Screen>
        <TaskDetail id={TASK_ID} />
      </Screen>,
    );
    const blocked = await screen.findByRole('button', { name: 'Enviar a Dirección → Dirección' });
    expect(blocked).toBeDisabled();
    expect(
      screen.getByText('El registro todavía no cumple la condición de esta acción.'),
    ).toBeInTheDocument();
    await userEvent.type(screen.getByLabelText('Comentario'), 'Lista');
    await userEvent.click(screen.getByRole('button', { name: 'Enviar a revisión → Revisión' }));
    await waitFor(() => {
      expect(sent.find((r) => r.method === 'POST')?.body).toEqual({
        action: 'submit',
        comment: 'Lista',
      });
    });
  });
});

describe('historial de la tarea', () => {
  it('muestra el historial con actor, a nombre de quién, fecha y comentario', async () => {
    serve(WORKER);
    renderWithApi(
      <Screen>
        <TaskDetail id={TASK_ID} />
      </Screen>,
    );
    const history = await screen.findByRole('region', { name: 'Historial del flujo' });
    expect(within(history).getByText('Inició el trámite')).toBeInTheDocument();
    expect(within(history).getByText('luis@demo-uno.test')).toBeInTheDocument();
    expect(within(history).getByText(/a nombre de Ana Pérez/)).toBeInTheDocument();
    expect(within(history).getByText('«Falta la cotización»')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Compra de portátiles' })).toHaveAttribute(
      'href',
      `/app/mis-tareas/tramites/${INSTANCE_ID}`,
    );
  });

  it('quien solo la ve no tiene acciones', async () => {
    serve(WORKER, {
      [`GET /v1/tasks/${TASK_ID}`]: () => json(taskView({ can_act: false, reason: null })),
    });
    renderWithApi(
      <Screen>
        <TaskDetail id={TASK_ID} />
      </Screen>,
    );
    await screen.findByText('Historial del flujo');
    expect(screen.queryByText('Qué hacer')).not.toBeInTheDocument();
    expect(screen.queryByText('Delegar la tarea')).not.toBeInTheDocument();
  });
});

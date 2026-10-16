import { screen, waitFor } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import type { JSX, ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { SESSION, json, mockApi, noContent, renderWithApi } from '../../test-support/fake-api';
import {
  INSTANCE_ID,
  LUIS,
  TASK_ID,
  WF_ADMIN,
  WORKER,
  instanceView,
  taskSummary,
  taskView,
} from '../../test-support/wf-fixtures';
import { RequireSession } from '../session/session-provider';
import { InstanceDetail } from './instance-detail';
import { TaskBoard } from './task-board';
import { TaskDetail } from './task-detail';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace: vi.fn(), push: vi.fn() }),
  usePathname: () => '/app/mis-tareas',
}));

function Screen({ children }: { readonly children: ReactNode }): JSX.Element {
  return <RequireSession kind="internal">{children}</RequireSession>;
}

type Routes = Parameters<typeof mockApi>[0];

function serve(permissions: object, task: Record<string, unknown>, extra: Routes = {}) {
  return mockApi({
    'GET /v1/auth/session': () => json(SESSION),
    'GET /v1/me/permissions': () => json(permissions),
    [`GET /v1/tasks/${TASK_ID}`]: () => json(task),
    [`GET /v1/workflow-instances/${INSTANCE_ID}`]: () => json(instanceView()),
    'GET /v1/tasks': () => json({ data: [taskSummary({ reason: null })], next_cursor: null }),
    ...extra,
  });
}

const APPROVAL = taskView({
  kind: 'approval',
  actions: [],
  title: 'Revisión: Compra de portátiles',
});

beforeEach(() => {
  vi.stubGlobal('scrollTo', vi.fn());
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('aprobaciones', () => {
  it('aprueba con comentario opcional; rechazar exige el motivo', async () => {
    const sent = serve(WORKER, APPROVAL, {
      [`POST /v1/tasks/${TASK_ID}/actions/approve`]: () => noContent(),
      [`POST /v1/tasks/${TASK_ID}/actions/reject`]: () => noContent(),
    });
    renderWithApi(
      <Screen>
        <TaskDetail id={TASK_ID} />
      </Screen>,
    );
    const reject = await screen.findByRole('button', { name: 'Rechazar' });
    expect(reject).toBeDisabled();
    await userEvent.click(screen.getByRole('button', { name: 'Aprobar' }));
    await userEvent.type(screen.getByLabelText('Comentario'), 'Sin presupuesto');
    await userEvent.click(reject);
    await waitFor(() => {
      const posts = sent.filter((r) => r.method === 'POST');
      expect(posts.map((r) => [r.path.split('/').at(-1), r.body])).toEqual([
        ['approve', {}],
        ['reject', { comment: 'Sin presupuesto' }],
      ]);
    });
  });
});

describe('tareas de un rol', () => {
  it('una tarea de un rol se toma antes de atenderla', async () => {
    const roleTask = taskView({ assignee: null, assignee_role: 'CALIDAD', reason: 'role' });
    const sent = serve(WORKER, roleTask, {
      [`POST /v1/tasks/${TASK_ID}/actions/start`]: () => noContent(),
    });
    renderWithApi(
      <Screen>
        <TaskDetail id={TASK_ID} />
      </Screen>,
    );
    expect(await screen.findByText('Rol CALIDAD')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Tomar la tarea' }));
    await waitFor(() => {
      expect(sent.some((r) => r.path.endsWith('/actions/start'))).toBe(true);
    });
  });
});

describe('delegar y reasignar', () => {
  it('el responsable delega escribiendo el correo', async () => {
    const sent = serve(WORKER, taskView(), {
      [`POST /v1/tasks/${TASK_ID}/actions/delegate`]: () => noContent(),
    });
    renderWithApi(
      <Screen>
        <TaskDetail id={TASK_ID} />
      </Screen>,
    );
    await screen.findByText('Delegar la tarea');
    await userEvent.type(screen.getByLabelText('Correo de quien la recibe'), LUIS.email);
    await userEvent.click(screen.getByRole('button', { name: 'Delegar' }));
    await waitFor(() => {
      expect(sent.find((r) => r.method === 'POST')?.body).toEqual({ to_email: LUIS.email });
    });
    expect(screen.queryByText('Reasignar la tarea')).not.toBeInTheDocument();
  });

  it('quien reasigna tareas ve la reasignación de una tarea escalada', async () => {
    const escalated = taskView({
      reason: 'unassigned',
      status: 'overdue',
      escalated_at: '2026-10-17T13:00:00.000Z',
    });
    serve(WF_ADMIN, escalated);
    renderWithApi(
      <Screen>
        <TaskDetail id={TASK_ID} />
      </Screen>,
    );
    expect(await screen.findByText('Reasignar la tarea')).toBeInTheDocument();
    expect(screen.queryByText('Delegar la tarea')).not.toBeInTheDocument();
    expect(screen.getByText('Vencida')).toBeInTheDocument();
  });
});

describe('trámite y tablero', () => {
  it('el trámite ofrece sus acciones; la que exige comentario espera el comentario', async () => {
    const sent = serve(WORKER, taskView(), {
      [`POST /v1/workflow-instances/${INSTANCE_ID}/actions/cancel`]: () => noContent(),
    });
    renderWithApi(
      <Screen>
        <InstanceDetail id={INSTANCE_ID} />
      </Screen>,
    );
    const cancel = await screen.findByRole('button', { name: 'Cancelar → Revisión' });
    expect(cancel).toBeDisabled();
    await userEvent.type(screen.getByLabelText('Comentario'), 'Duplicada');
    await userEvent.click(cancel);
    await waitFor(() => {
      expect(sent.find((r) => r.method === 'POST')?.body).toEqual({ comment: 'Duplicada' });
    });
    expect(
      screen.getByRole('link', { name: 'Borrador: Compra de portátiles' }),
    ).toBeInTheDocument();
  });
});

describe('trámite terminado', () => {
  it('un trámite terminado no ofrece acciones', async () => {
    serve(WORKER, taskView(), {
      [`GET /v1/workflow-instances/${INSTANCE_ID}`]: () =>
        json(instanceView({ completed_at: '2026-10-16T15:00:00.000Z', actions: [] })),
    });
    renderWithApi(
      <Screen>
        <InstanceDetail id={INSTANCE_ID} />
      </Screen>,
    );
    expect(await screen.findByText(/El trámite terminó el 16\/10\/2026/)).toBeInTheDocument();
  });
});

describe('tablero de tareas', () => {
  it('el tablero filtra por estado y por escaladas', async () => {
    const sent = serve(WF_ADMIN, taskView());
    renderWithApi(
      <Screen>
        <TaskBoard />
      </Screen>,
    );
    await screen.findByText('Borrador: Compra de portátiles');
    await userEvent.selectOptions(screen.getByLabelText('Estado'), 'overdue');
    await userEvent.click(screen.getByLabelText('Solo las escaladas'));
    await waitFor(() => {
      expect(sent.at(-1)?.search).toBe('?limit=25&status=overdue&escalated=true');
    });
  });
});

describe('tablero vacío y por páginas', () => {
  it('dice cuando no hay tareas y pasa a la página siguiente', async () => {
    const sent = serve(WF_ADMIN, taskView(), {
      'GET /v1/tasks': (request) =>
        request.search.includes('cursor')
          ? json({ data: [], next_cursor: null })
          : json({ data: [taskSummary({ reason: null })], next_cursor: TASK_ID }),
    });
    renderWithApi(
      <Screen>
        <TaskBoard />
      </Screen>,
    );
    await userEvent.click(await screen.findByRole('button', { name: 'Página siguiente' }));
    expect(await screen.findByText('No hay tareas con estos filtros.')).toBeInTheDocument();
    expect(sent.at(-1)?.search).toContain(`cursor=${TASK_ID}`);
  });
});

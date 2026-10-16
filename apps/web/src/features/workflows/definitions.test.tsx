import { screen, waitFor } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import type { JSX, ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { SESSION, json, mockApi, noContent, renderWithApi } from '../../test-support/fake-api';
import { DEFINITION_ID, INSTANCE_ID, WF_ADMIN } from '../../test-support/wf-fixtures';
import { RequireSession } from '../session/session-provider';
import { DefinitionEditor, NewDefinition } from './definition-editor';
import { DefinitionsList } from './definitions-list';

const push = vi.fn();

vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace: vi.fn(), push }),
  usePathname: () => '/app/administracion/flujos',
}));

function Screen({ children }: { readonly children: ReactNode }): JSX.Element {
  return <RequireSession kind="internal">{children}</RequireSession>;
}

const SUMMARY = {
  id: DEFINITION_ID,
  key: 'demo.request',
  name: 'Solicitud de prueba',
  entity_type: 'demo.request',
  version: 1,
  status: 'published',
  published_at: '2026-10-15T14:00:00.000Z',
  updated_at: '2026-10-15T14:00:00.000Z',
};

const STATES = [
  {
    key: 'draft',
    label: 'Borrador',
    kind: 'initial',
    sla_hours: 8,
    priority: 'normal',
    assignee: { type: 'initiator' },
    approval: null,
  },
  {
    key: 'done',
    label: 'Aprobada',
    kind: 'final',
    sla_hours: null,
    priority: 'normal',
    assignee: null,
    approval: null,
  },
];

const TRANSITIONS = [
  {
    from_state: 'draft',
    to_state: 'done',
    action: 'submit',
    label: 'Enviar',
    required_permission: null,
    condition: [{ fact: 'amount', op: 'lte', value: 5000000 }],
    requires_comment: false,
  },
];

function view(overrides: Record<string, unknown> = {}) {
  return {
    ...SUMMARY,
    description: null,
    states: STATES,
    transitions: TRANSITIONS,
    row_version: 4,
    problems: [],
    ...overrides,
  };
}

function serve(extra: Parameters<typeof mockApi>[0] = {}) {
  return mockApi({
    'GET /v1/auth/session': () => json(SESSION),
    'GET /v1/me/permissions': () => json(WF_ADMIN),
    'GET /v1/roles': () => json({ data: [] }),
    'GET /v1/workflows': () => json({ data: [SUMMARY] }),
    [`GET /v1/workflows/${DEFINITION_ID}`]: () => json(view()),
    ...extra,
  });
}

beforeEach(() => {
  vi.stubGlobal('scrollTo', vi.fn());
  push.mockReset();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('lista de flujos', () => {
  it('muestra cada versión e inicia un trámite de prueba con el monto', async () => {
    const sent = serve({
      [`POST /v1/workflows/${DEFINITION_ID}/actions/start-test`]: () =>
        json({ id: INSTANCE_ID }, 201),
    });
    renderWithApi(
      <Screen>
        <DefinitionsList />
      </Screen>,
    );
    expect(await screen.findByRole('link', { name: 'Solicitud de prueba' })).toBeInTheDocument();
    expect(screen.getByText('Publicada', { selector: 'span' })).toBeInTheDocument();
    await userEvent.type(screen.getByLabelText('Asunto'), 'Compra de sillas');
    await userEvent.type(screen.getByLabelText('Monto (dato «amount»)'), '6000000');
    await userEvent.click(screen.getByRole('button', { name: 'Iniciar el trámite' }));
    await waitFor(() => {
      expect(push).toHaveBeenCalledWith(`/app/mis-tareas/tramites/${INSTANCE_ID}`);
    });
    expect(sent.find((r) => r.method === 'POST')?.body).toEqual({
      title: 'Compra de sillas',
      facts: { amount: 6000000 },
    });
  });
});

describe('lista de flujos vacía', () => {
  it('sin flujos invita a crear el primero', async () => {
    serve({ 'GET /v1/workflows': () => json({ data: [] }) });
    renderWithApi(
      <Screen>
        <DefinitionsList />
      </Screen>,
    );
    expect(await screen.findByText('Todavía no hay flujos')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Crear un flujo' })).toHaveAttribute(
      'href',
      '/app/administracion/flujos/nuevo',
    );
  });
});

describe('editor de flujos', () => {
  it('un flujo nuevo muestra lo que falta y se guarda como borrador', async () => {
    const sent = serve({ 'POST /v1/workflows': () => json({ id: DEFINITION_ID }, 201) });
    renderWithApi(
      <Screen>
        <NewDefinition />
      </Screen>,
    );
    expect(await screen.findByText('El estado «Borrador» no tiene salida.')).toBeInTheDocument();
    await userEvent.type(screen.getByLabelText('Nombre del flujo'), 'Compras');
    await userEvent.type(screen.getByLabelText('Clave del flujo'), 'compras.solicitud');
    await userEvent.click(screen.getByRole('button', { name: 'Agregar una transición' }));
    expect(
      await screen.findByText('El flujo está completo: se puede publicar.'),
    ).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Guardar el borrador' }));
    await waitFor(() => {
      expect(push).toHaveBeenCalledWith(`/app/administracion/flujos/${DEFINITION_ID}`);
    });
    expect(sent.find((r) => r.method === 'POST')?.body).toMatchObject({
      key: 'compras.solicitud',
      name: 'Compras',
    });
  });
});

describe('editor: estados de aprobación', () => {
  it('un estado de aprobación pide quién aprueba y cómo', async () => {
    serve();
    renderWithApi(
      <Screen>
        <NewDefinition />
      </Screen>,
    );
    await userEvent.selectOptions(
      await screen.findByLabelText('Tipo', { selector: '#estado-0-tipo' }),
      'approval',
    );
    expect(screen.getByLabelText('Cómo se aprueba')).toHaveValue('serial');
    expect(screen.getByLabelText('Aprobador 1')).toHaveValue('supervisor');
    await userEvent.selectOptions(screen.getByLabelText('Aprobador 2'), 'initiator');
    expect(screen.getByLabelText('Aprobador 2')).toHaveValue('initiator');
  });
});

describe('editor: versiones', () => {
  it('una versión publicada no se edita: se crea una versión nueva', async () => {
    const sent = serve({
      [`POST /v1/workflows/${DEFINITION_ID}/actions/new-version`]: () =>
        json({ id: INSTANCE_ID }, 201),
    });
    renderWithApi(
      <Screen>
        <DefinitionEditor id={DEFINITION_ID} />
      </Screen>,
    );
    expect(await screen.findByText('Publicada · versión 1')).toBeInTheDocument();
    expect(screen.getByLabelText('Nombre del flujo')).toBeDisabled();
    expect(screen.getByLabelText('Dato del registro')).toHaveValue('amount');
    expect(screen.queryByRole('button', { name: 'Guardar el borrador' })).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Crear una versión nueva' }));
    await waitFor(() => {
      expect(push).toHaveBeenCalledWith(`/app/administracion/flujos/${INSTANCE_ID}`);
    });
    expect(sent.some((r) => r.path.endsWith('/new-version'))).toBe(true);
  });
});

describe('editor: guardar y publicar', () => {
  it('un borrador se guarda con su versión y se publica', async () => {
    const sent = serve({
      [`GET /v1/workflows/${DEFINITION_ID}`]: () =>
        json(view({ status: 'draft', published_at: null })),
      [`PATCH /v1/workflows/${DEFINITION_ID}`]: () => noContent(),
      [`POST /v1/workflows/${DEFINITION_ID}/actions/publish`]: () => noContent(),
    });
    renderWithApi(
      <Screen>
        <DefinitionEditor id={DEFINITION_ID} />
      </Screen>,
    );
    await userEvent.click(await screen.findByLabelText('Exige comentario'));
    await userEvent.click(screen.getByRole('button', { name: 'Guardar el borrador' }));
    await userEvent.click(screen.getByRole('button', { name: 'Publicar esta versión' }));
    await waitFor(() => {
      expect(
        sent.filter((r) => r.method !== 'GET').map((r) => [r.method, r.headers['If-Match']]),
      ).toEqual([
        ['PATCH', '"4"'],
        ['POST', '"4"'],
      ]);
    });
  });
});

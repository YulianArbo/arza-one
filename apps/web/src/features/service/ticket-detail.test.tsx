import { screen, within } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { Screen } from '../../test-support/core-fixtures';
import { apiError, json, noContent, renderWithApi } from '../../test-support/fake-api';
import {
  COLLEAGUE,
  COMPENSATION_ID,
  OTHER_AGENT,
  SERVICE_AGENT,
  TICKET_ID,
  serveService,
  ticketRoute,
} from '../../test-support/service-fixtures';
import { TicketDetailPanel } from './ticket-detail';

// Ficha del tiquete (B28): estado y reloj, las acciones que el estado admite, la conversación con
// notas internas y las compensaciones.

vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace: vi.fn(), push: vi.fn(), back: vi.fn() }),
  usePathname: () => '/app/servicio',
}));

beforeEach(() => {
  vi.stubGlobal('scrollTo', vi.fn());
});

afterEach(() => {
  vi.unstubAllGlobals();
});

const BASE = `/v1/tickets/${TICKET_ID}`;

function show(): void {
  renderWithApi(
    <Screen>
      <TicketDetailPanel id={TICKET_ID} />
    </Screen>,
  );
}

async function dialogOf(button: string) {
  await userEvent.click(await screen.findByRole('button', { name: button }));
  return screen.findByRole('dialog');
}

describe('estado y datos', () => {
  it('muestra el reloj, la garantía y los datos del tiquete', async () => {
    serveService(SERVICE_AGENT);
    show();
    expect(await screen.findByText('Consumió el 80 % del plazo de solución.')).toBeVisible();
    expect(screen.getAllByText('En garantía').length).toBeGreaterThan(0);
    await userEvent.click(screen.getByRole('tab', { name: 'Datos' }));
    expect(await screen.findByText(/1 h para responder y 4 h para resolver/u)).toBeVisible();
    expect(screen.getByText(/N1 · Servicio al cliente/u)).toBeVisible();
    expect(screen.getByText('Ana Gómez')).toBeVisible();
  });

  it('pausado, vencido y resuelto explican qué pasa con el reloj', async () => {
    serveService(
      SERVICE_AGENT,
      ticketRoute({ status: 'waiting_customer', clock: 'paused', resolution_due_at: null }),
    );
    show();
    expect(await screen.findByText(/el reloj está pausado/u)).toBeVisible();
    expect(screen.getByRole('button', { name: 'Reanudar' })).toBeVisible();
  });
});

describe('estado: vencido y resuelto', () => {
  it('vencido pide atenderlo o escalarlo', async () => {
    serveService(SERVICE_AGENT, ticketRoute({ clock: 'overdue', level: 3 }));
    show();
    expect(await screen.findByText(/Venció el plazo/u)).toBeVisible();
    expect(screen.queryByRole('button', { name: 'Escalar' })).toBeNull();
  });

  it('resuelto dice cuándo se cierra solo y permite reabrir y cerrar', async () => {
    const sent = serveService(SERVICE_AGENT, {
      ...ticketRoute({
        status: 'resolved',
        clock: 'stopped',
        resolved_at: '2026-11-06T18:00:00.000Z',
        resolution: 'Se reconstruyó el índice.',
        auto_close_at: '2026-11-14T04:59:00.000Z',
        can: { ...ticketDefaults(), reopen: true, close: true, work: false, assign: false },
      }),
      [`POST ${BASE}/actions/close`]: () => noContent(),
    });
    show();
    expect(await screen.findByText(/se cierra solo/u)).toBeVisible();
    await userEvent.click(screen.getByRole('button', { name: 'Cerrar' }));
    await vi.waitFor(() => {
      expect(sent.some((request) => request.path.endsWith('/actions/close'))).toBe(true);
    });
    expect(screen.getByRole('button', { name: 'Reabrir' })).toBeVisible();
  });
});

function ticketDefaults() {
  return {
    update: true,
    assign: true,
    work: true,
    reopen: false,
    close: false,
    write_internal: true,
    write_public: true,
    propose_compensation: true,
    decide_compensation: true,
  };
}

describe('acciones', () => {
  it('escala con su motivo y a quién', async () => {
    const sent = serveService(SERVICE_AGENT, {
      [`POST ${BASE}/actions/escalate`]: () => noContent(),
    });
    show();
    const dialog = await dialogOf('Escalar');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Escalar' }));
    expect(within(dialog).getAllByText('Elija a quién.').length).toBeGreaterThan(0);
    await userEvent.selectOptions(
      within(dialog).getByLabelText('Responsable'),
      await within(dialog).findByRole('option', { name: OTHER_AGENT.name }),
    );
    await userEvent.type(
      within(dialog).getByLabelText('Por qué se escala'),
      'Requiere la base de datos.',
    );
    await userEvent.click(within(dialog).getByRole('button', { name: 'Escalar' }));
    await vi.waitFor(() => {
      expect(sent.find((request) => request.path.endsWith('/escalate'))?.body).toEqual({
        assignee_id: OTHER_AGENT.id,
        reason: 'Requiere la base de datos.',
      });
    });
  });
});

describe('acciones: asignar', () => {
  it('asigna sin motivo', async () => {
    const sent = serveService(SERVICE_AGENT, {
      [`POST ${BASE}/actions/assign`]: () => noContent(),
    });
    show();
    const dialog = await dialogOf('Asignar');
    await userEvent.selectOptions(
      within(dialog).getByLabelText('Responsable'),
      await within(dialog).findByRole('option', { name: OTHER_AGENT.name }),
    );
    await userEvent.click(within(dialog).getByRole('button', { name: 'Asignar' }));
    await vi.waitFor(() => {
      expect(sent.find((request) => request.path.endsWith('/assign'))?.body).toEqual({
        assignee_id: OTHER_AGENT.id,
      });
    });
  });
});

describe('acciones: espera y solución', () => {
  it('pone en espera con la nota opcional y resuelve con la solución', async () => {
    const sent = serveService(SERVICE_AGENT, {
      [`POST ${BASE}/actions/wait`]: () => noContent(),
      [`POST ${BASE}/actions/resolve`]: () => noContent(),
    });
    show();
    const wait = await dialogOf('Poner en espera del cliente');
    await userEvent.click(within(wait).getByRole('button', { name: 'Poner en espera' }));
    await vi.waitFor(() => {
      expect(sent.find((request) => request.path.endsWith('/wait'))?.body).toEqual({ note: null });
    });
    await userEvent.keyboard('{Escape}');
    const resolve = await dialogOf('Resolver');
    await userEvent.click(within(resolve).getByRole('button', { name: 'Resolver' }));
    expect(within(resolve).getAllByText(/tres letras/u).length).toBeGreaterThan(0);
    await userEvent.type(
      within(resolve).getByLabelText('Cómo se resolvió'),
      'Índice reconstruido.',
    );
    await userEvent.click(within(resolve).getByRole('button', { name: 'Resolver' }));
    await vi.waitFor(() => {
      expect(sent.find((request) => request.path.endsWith('/resolve'))?.body).toEqual({
        resolution: 'Índice reconstruido.',
      });
    });
  });
});

describe('acciones: un clic', () => {
  it('empieza un tiquete asignado con un clic y muestra el error de la API', async () => {
    serveService(SERVICE_AGENT, {
      ...ticketRoute({ status: 'assigned', clock: 'on_time' }),
      [`POST ${BASE}/actions/start`]: () =>
        apiError(409, 'SERVICE_STATUS_INVALID', 'Otra persona ya lo empezó.'),
    });
    show();
    await userEvent.click(await screen.findByRole('button', { name: 'Empezar' }));
    expect(await screen.findByText(/Otra persona ya lo empezó/u)).toBeVisible();
  });
});

describe('conversación', () => {
  it('el equipo ve las notas internas y escribe una', async () => {
    const sent = serveService(SERVICE_AGENT, {
      [`POST ${BASE}/messages`]: () => json({ id: TICKET_ID }, 201),
    });
    show();
    expect(await screen.findByText('Revisar los registros del servidor.')).toBeVisible();
    expect(screen.getByText('Cliente')).toBeVisible();
    await userEvent.click(screen.getByRole('button', { name: 'Agregar a la conversación' }));
    expect(screen.getByText('Escriba el mensaje.')).toBeVisible();
    await userEvent.selectOptions(screen.getByLabelText('Tipo de mensaje'), 'internal');
    await userEvent.type(screen.getByLabelText('Mensaje'), 'Revisar la consulta.');
    await userEvent.click(screen.getByRole('button', { name: 'Agregar a la conversación' }));
    await vi.waitFor(() => {
      expect(sent.find((request) => request.method === 'POST')?.body).toEqual({
        body: 'Revisar la consulta.',
        is_internal: true,
        from_client: false,
      });
    });
  });
});

describe('conversación: quien pidió', () => {
  it('quien pidió el tiquete escribe sin elegir el tipo y no ve acciones', async () => {
    serveService(COLLEAGUE, {
      ...ticketRoute({
        can: {
          ...ticketDefaults(),
          assign: false,
          work: false,
          write_internal: false,
          propose_compensation: false,
          decide_compensation: false,
        },
      }),
      [`GET ${BASE}/messages`]: () => json({ data: [] }),
    });
    show();
    expect(await screen.findByText('Sin mensajes todavía')).toBeVisible();
    expect(screen.queryByLabelText('Tipo de mensaje')).toBeNull();
    expect(screen.queryByRole('group', { name: 'Acciones del tiquete' })).toBeNull();
    expect(screen.queryByRole('tab', { name: 'Compensaciones' })).toBeNull();
  });
});

describe('compensaciones', () => {
  it('propone, aprueba y marca como aplicada', async () => {
    const sent = serveService(SERVICE_AGENT, {
      [`POST ${BASE}/compensations`]: () => json({ id: COMPENSATION_ID }, 201),
      [`POST ${BASE}/compensations/${COMPENSATION_ID}/actions/decide`]: () => noContent(),
    });
    show();
    await userEvent.click(await screen.findByRole('tab', { name: 'Compensaciones' }));
    expect(await screen.findByText(/150.000/u)).toBeVisible();
    expect(screen.getByText('2,5 h')).toBeVisible();
    await userEvent.click(screen.getByRole('button', { name: 'Aprobar' }));
    await vi.waitFor(() => {
      expect(sent.find((request) => request.path.endsWith('/decide'))?.body).toEqual({
        approve: true,
      });
    });
    const dialog = await dialogOf('Proponer una compensación');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Proponer' }));
    expect(within(dialog).getAllByText(/mayor que cero/u).length).toBeGreaterThan(0);
    await userEvent.selectOptions(within(dialog).getByLabelText('Tipo'), 'service_extension');
    await userEvent.type(within(dialog).getByLabelText(/Días de extensión/u), '15');
    await userEvent.type(within(dialog).getByLabelText('Por qué se compensa'), 'Plazo superado.');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Proponer' }));
    await vi.waitFor(() => {
      expect(
        sent.find((request) => request.path.endsWith('/compensations') && request.method === 'POST')
          ?.body,
      ).toEqual({
        type: 'service_extension',
        amount: null,
        hours: null,
        days: 15,
        reason: 'Plazo superado.',
      });
    });
    expect(screen.getByRole('button', { name: 'Marcar aplicada hoy' })).toBeVisible();
  });
});

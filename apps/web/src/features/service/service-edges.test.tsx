import { screen, within } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { Screen } from '../../test-support/core-fixtures';
import { json, renderWithApi } from '../../test-support/fake-api';
import {
  SERVICE_AGENT,
  TICKET_ID,
  serveService,
  ticketRoute,
} from '../../test-support/service-fixtures';
import { levelLabel } from './labels';
import { SlaPoliciesPage } from './sla-policies-page';
import { TicketDetailPanel } from './ticket-detail';
import { WarrantiesPage } from './warranties-page';

// Casos de borde de la mesa de ayuda (B28): un tiquete interno sin cliente ni proyecto, la garantía
// vencida, la primera respuesta ya dada, un tiquete cerrado, compensaciones en días y aplicadas, y
// los formularios con campos vacíos.

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

const READ_ONLY = {
  update: false,
  assign: false,
  work: false,
  reopen: false,
  close: false,
  write_internal: false,
  write_public: false,
  propose_compensation: false,
  decide_compensation: true,
};

function showTicket(): void {
  renderWithApi(
    <Screen>
      <TicketDetailPanel id={TICKET_ID} />
    </Screen>,
  );
}

describe('ficha: tiquete interno y cerrado', () => {
  it('sin cliente, proyecto ni entregable, con la respuesta dada y la garantía vencida', async () => {
    serveService(SERVICE_AGENT, {
      ...ticketRoute({
        status: 'closed',
        clock: 'stopped',
        party: null,
        requester_name: null,
        requester: { id: TICKET_ID, name: 'Pedro Colaborador' },
        project: null,
        deliverable: null,
        in_warranty: false,
        first_response_at: '2026-11-06T15:30:00.000Z',
        resolved_at: '2026-11-06T18:00:00.000Z',
        resolution: 'Se reconstruyó el índice.',
        closed_at: '2026-11-07T18:00:00.000Z',
        created_by: null,
        assignee: null,
        level: 2,
        can: READ_ONLY,
      }),
    });
    showTicket();
    await userEvent.click(await screen.findByRole('tab', { name: 'Datos' }));
    expect(await screen.findByText('Interno')).toBeVisible();
    expect(screen.getByText('Pedro Colaborador')).toBeVisible();
    expect(screen.getByText(/Vencida hasta el/u)).toBeVisible();
    expect(screen.getByText(/Dada el/u)).toBeVisible();
    expect(screen.getByText('Sin asignar')).toBeVisible();
    expect(screen.getByText(/N2 · /u)).toBeVisible();
    expect(screen.queryByRole('group', { name: 'Acciones del tiquete' })).toBeNull();
  });
});

describe('ficha: sin garantía y en pausa', () => {
  it('sin garantía y en pausa lo dice', async () => {
    serveService(SERVICE_AGENT, {
      ...ticketRoute({
        warranty: null,
        in_warranty: false,
        status: 'waiting_customer',
        clock: 'paused',
        resolution_due_at: null,
        response_due_at: null,
        can: READ_ONLY,
      }),
    });
    showTicket();
    await userEvent.click(await screen.findByRole('tab', { name: 'Datos' }));
    expect(await screen.findByText('Sin garantía')).toBeVisible();
    expect(screen.getAllByText(/En pausa/u).length).toBeGreaterThan(0);
  });
});

describe('compensaciones en días y aplicadas', () => {
  it('muestra los días y la fecha de aplicación, sin botones de decisión', async () => {
    serveService(SERVICE_AGENT, {
      ...ticketRoute({
        can: { ...READ_ONLY, decide_compensation: false, propose_compensation: true },
      }),
      [`GET /v1/tickets/${TICKET_ID}/compensations`]: () =>
        json({
          data: [
            {
              id: '01999a00-0000-7000-8000-0000000f8103',
              ticket: { id: TICKET_ID, code: 'TIQ-2026-0001' },
              type: 'service_extension',
              amount: null,
              hours: null,
              days: 15,
              reason: 'Extensión por demora.',
              status: 'applied',
              proposed_by: null,
              decided_by: null,
              decided_at: '2026-11-06T15:30:00.000Z',
              decision_note: null,
              applied_on: '2026-11-06',
              created_at: '2026-11-06T15:21:00.000Z',
              version: 3,
            },
          ],
        }),
    });
    showTicket();
    await userEvent.click(await screen.findByRole('tab', { name: 'Compensaciones' }));
    expect(await screen.findByText('15 días')).toBeVisible();
    expect(screen.getByText(/Aplicada el/u)).toBeVisible();
    expect(screen.queryByRole('button', { name: 'Aprobar' })).toBeNull();
  });
});

describe('formularios con campos vacíos', () => {
  it('el acuerdo pide plazos mayores que cero', async () => {
    serveService(SERVICE_AGENT);
    renderWithApi(
      <Screen>
        <SlaPoliciesPage />
      </Screen>,
    );
    await userEvent.click(await screen.findByRole('button', { name: /prioridad alta/u }));
    const dialog = await screen.findByRole('dialog');
    await userEvent.clear(within(dialog).getByLabelText('Horas para la primera respuesta'));
    await userEvent.clear(within(dialog).getByLabelText('Horas para la solución'));
    await userEvent.click(within(dialog).getByRole('button', { name: 'Guardar' }));
    expect(within(dialog).getAllByText(/mayor que cero/u).length).toBeGreaterThan(1);
  });

  it('la garantía pide qué cubre; sin permiso no se ajusta', async () => {
    serveService(SERVICE_AGENT);
    renderWithApi(
      <Screen>
        <WarrantiesPage />
      </Screen>,
    );
    await userEvent.click(await screen.findByRole('button', { name: /Ajustar la garantía/u }));
    const dialog = await screen.findByRole('dialog');
    await userEvent.clear(within(dialog).getByLabelText('Qué cubre'));
    await userEvent.click(within(dialog).getByRole('button', { name: 'Guardar' }));
    expect(within(dialog).getAllByText(/qué cubre la garantía/u).length).toBeGreaterThan(0);
  });

  it('un nivel desconocido se muestra con su número', () => {
    expect(levelLabel(9)).toBe('Nivel 9');
    expect(levelLabel(3)).toMatch(/^N3/u);
  });
});

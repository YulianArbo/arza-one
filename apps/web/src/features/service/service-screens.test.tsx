import { screen, within } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import type { ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { Screen } from '../../test-support/core-fixtures';
import { json, noContent, renderWithApi } from '../../test-support/fake-api';
import { PERSON_ID } from '../../test-support/party-fixtures';
import {
  COLLEAGUE,
  POLICY_ID,
  SERVICE_AGENT,
  TICKET_ID,
  WARRANTY_ID,
  serveService,
} from '../../test-support/service-fixtures';
import { SlaPoliciesPage } from './sla-policies-page';
import { TicketForm } from './ticket-form';
import { TicketInbox } from './ticket-inbox';
import { WarrantiesPage } from './warranties-page';

// Pantallas de la mesa de ayuda (B28): bandeja, registro, acuerdos de tiempo y garantías.

const push = vi.fn();

vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace: vi.fn(), push, back: vi.fn() }),
  usePathname: () => '/app/servicio',
}));

beforeEach(() => {
  vi.stubGlobal('scrollTo', vi.fn());
});

afterEach(() => {
  vi.unstubAllGlobals();
  push.mockReset();
});

function show(ui: ReactNode): void {
  renderWithApi(<Screen>{ui}</Screen>);
}

describe('bandeja', () => {
  it('lista los tiquetes con su reloj y filtra por vista', async () => {
    const sent = serveService(SERVICE_AGENT);
    show(<TicketInbox />);
    expect(await screen.findByRole('link', { name: 'TIQ-2026-0001' })).toBeVisible();
    expect(screen.getByText('Vencido')).toBeVisible();
    expect(screen.getByText('En garantía')).toBeVisible();
    expect(screen.getByText('Pedro Colaborador')).toBeVisible();
    expect(screen.getByRole('link', { name: 'Garantías' })).toBeVisible();
    await userEvent.selectOptions(screen.getByLabelText('Vista'), 'overdue');
    await userEvent.selectOptions(screen.getByLabelText('Prioridad'), 'critical');
    await userEvent.type(screen.getByLabelText(/Buscar/u), 'reporte');
    await userEvent.click(screen.getByRole('button', { name: 'Ver' }));
    await vi.waitFor(() => {
      expect(sent.some((request) => request.search.includes('view=overdue'))).toBe(true);
    });
  });

  it('sin tiquetes explica qué aparece; quien solo ve lo suyo no ve las garantías', async () => {
    serveService(COLLEAGUE, { 'GET /v1/tickets': () => json({ data: [], next_cursor: null }) });
    show(<TicketInbox />);
    expect(await screen.findByText('No hay tiquetes en esta vista')).toBeVisible();
    expect(screen.queryByRole('link', { name: 'Garantías' })).toBeNull();
    expect(screen.getByRole('link', { name: 'Nuevo tiquete' })).toBeVisible();
  });
});

describe('registro', () => {
  it('pide los datos y registra a nombre del cliente', async () => {
    const sent = serveService(SERVICE_AGENT, {
      'POST /v1/tickets': () => json({ id: TICKET_ID }, 201),
    });
    show(<TicketForm />);
    const submit = await screen.findByRole('button', { name: 'Registrar el tiquete' });
    await userEvent.click(submit);
    expect(screen.getAllByText('Escriba un asunto corto.').length).toBeGreaterThan(0);
    await userEvent.type(screen.getByLabelText('Asunto'), 'No carga el reporte');
    await userEvent.type(screen.getByLabelText('Qué pasa'), 'Queda en blanco.');
    await userEvent.selectOptions(screen.getByLabelText('Prioridad'), 'critical');
    await userEvent.type(screen.getByLabelText(/Buscar el cliente/u), 'Laura');
    await userEvent.selectOptions(
      screen.getByLabelText('Cliente (opcional)'),
      await screen.findByRole('option', { name: 'Laura Gómez Ríos' }),
    );
    await userEvent.type(screen.getByLabelText(/Quién reporta/u), 'Ana Gómez');
    await userEvent.selectOptions(screen.getByLabelText('Por dónde llegó'), 'phone');
    await userEvent.click(submit);
    await vi.waitFor(() => {
      expect(push).toHaveBeenCalledWith(`/app/servicio/tiquetes/${TICKET_ID}`);
    });
    expect(sent.find((request) => request.method === 'POST')?.body).toMatchObject({
      priority: 'critical',
      channel: 'phone',
      party_id: PERSON_ID,
      requester_name: 'Ana Gómez',
    });
  });

  it('un colaborador registra lo suyo sin elegir cliente', async () => {
    serveService(COLLEAGUE);
    show(<TicketForm />);
    expect(await screen.findByLabelText('Asunto')).toBeVisible();
    expect(screen.queryByLabelText('Cliente (opcional)')).toBeNull();
  });
});

describe('acuerdos de tiempo', () => {
  it('cambia el plazo de una prioridad y valida que la solución no sea menor', async () => {
    const sent = serveService(SERVICE_AGENT, {
      [`PUT /v1/sla-policies/${POLICY_ID}`]: () => noContent(),
    });
    show(<SlaPoliciesPage />);
    expect(await screen.findByText('Corrido, 24 horas al día')).toBeVisible();
    await userEvent.click(screen.getByRole('button', { name: /prioridad crítica/u }));
    const dialog = await screen.findByRole('dialog');
    const resolution = within(dialog).getByLabelText('Horas para la solución');
    await userEvent.clear(resolution);
    await userEvent.type(resolution, '0,5');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Guardar' }));
    expect(within(dialog).getAllByText(/menor que la respuesta/u).length).toBeGreaterThan(0);
    await userEvent.clear(resolution);
    await userEvent.type(resolution, '6');
    await userEvent.selectOptions(
      within(dialog).getByLabelText('Cómo cuenta el reloj'),
      'business',
    );
    await userEvent.click(within(dialog).getByRole('button', { name: 'Guardar' }));
    await vi.waitFor(() => {
      expect(sent.find((request) => request.method === 'PUT')?.body).toEqual({
        first_response_hours: 1,
        resolution_hours: 6,
        calendar: 'business',
      });
    });
  });
});

describe('garantías', () => {
  it('lista las vigentes y ajusta el fin y el alcance', async () => {
    const sent = serveService(SERVICE_AGENT, {
      [`PUT /v1/warranties/${WARRANTY_ID}`]: () => noContent(),
    });
    show(<WarrantiesPage />);
    expect(await screen.findByText('Vigente')).toBeVisible();
    await userEvent.click(screen.getByRole('button', { name: /Ajustar la garantía/u }));
    const dialog = await screen.findByRole('dialog');
    const ends = within(dialog).getByLabelText('Hasta cuándo cubre');
    await userEvent.clear(ends);
    await userEvent.type(ends, '2026-01-01');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Guardar' }));
    expect(within(dialog).getAllByText(/antes de empezar/u).length).toBeGreaterThan(0);
    await userEvent.clear(ends);
    await userEvent.type(ends, '2027-03-06');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Guardar' }));
    await vi.waitFor(() => {
      expect(sent.find((request) => request.method === 'PUT')?.body).toMatchObject({
        ends_on: '2027-03-06',
      });
    });
  });

  it('sin garantías en la vista lo explica', async () => {
    const sent = serveService(SERVICE_AGENT, {
      'GET /v1/warranties': () => json({ data: [], can_manage: false }),
    });
    show(<WarrantiesPage />);
    expect(await screen.findByText('No hay garantías en esta vista')).toBeVisible();
    await userEvent.selectOptions(screen.getByLabelText('Mostrar'), 'false');
    await vi.waitFor(() => {
      expect(sent.some((request) => request.search === '?active=false')).toBe(true);
    });
  });
});

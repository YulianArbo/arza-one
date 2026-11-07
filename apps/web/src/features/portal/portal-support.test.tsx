import { screen, within } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import type { ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { json, renderWithApi } from '../../test-support/fake-api';
import {
  ARTICLE_ID,
  CLIENT_ADMIN,
  CLIENT_USER,
  PROJECT_ID,
  PortalScreen,
  TICKET_ID,
  servePortal,
  ticketDetail,
} from '../../test-support/portal-fixtures';
import { PortalSupportPage } from './portal-support';
import { PortalArticlePage, PortalTicketPage } from './portal-ticket';

// Soporte en el portal (B30): pedir soporte, responder, radicar una PQRSF y leer la ayuda. Datos
// ficticios.

const push = vi.fn();

vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace: vi.fn(), push, back: vi.fn() }),
  usePathname: () => '/portal/soporte',
}));

beforeEach(() => {
  vi.stubGlobal('scrollTo', vi.fn());
});

afterEach(() => {
  vi.unstubAllGlobals();
  push.mockReset();
});

function show(ui: ReactNode): void {
  renderWithApi(<PortalScreen>{ui}</PortalScreen>);
}

describe('pedir soporte', () => {
  it('valida, registra la solicitud con su proyecto y abre su ficha', async () => {
    const sent = servePortal(CLIENT_ADMIN, {
      'POST /v1/portal/tickets': () => json({ id: TICKET_ID }, 201),
    });
    show(<PortalSupportPage />);
    await userEvent.click(await screen.findByRole('button', { name: 'Pedir soporte' }));
    const dialog = await screen.findByRole('dialog');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Enviar solicitud' }));
    expect(within(dialog).getAllByText('Escriba un asunto corto.').length).toBeGreaterThan(0);
    await userEvent.type(within(dialog).getByLabelText('Asunto'), 'No abre el reporte');
    await userEvent.type(within(dialog).getByLabelText('Qué pasa'), 'El reporte queda en blanco.');
    await userEvent.selectOptions(within(dialog).getByLabelText('Proyecto (opcional)'), PROJECT_ID);
    await userEvent.click(within(dialog).getByRole('button', { name: 'Enviar solicitud' }));
    await vi.waitFor(() => {
      expect(push).toHaveBeenCalledWith(`/portal/soporte/${TICKET_ID}`);
    });
    const created = sent.find((r) => r.method === 'POST' && r.path === '/v1/portal/tickets');
    expect(created?.body).toMatchObject({ project_id: PROJECT_ID, priority: 'medium' });
  });

  it('sin permiso para crear no ofrece pedir soporte y sin solicitudes lo dice', async () => {
    servePortal(CLIENT_USER, { 'GET /v1/portal/tickets': () => json({ data: [] }) });
    show(<PortalSupportPage />);
    expect(await screen.findByText('Sin solicitudes de soporte')).toBeVisible();
    expect(screen.queryByRole('button', { name: 'Pedir soporte' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Radicar PQRSF' })).toBeNull();
  });
});

describe('PQRSF', () => {
  it('radica una PQRSF y muestra el radicado y la fecha límite', async () => {
    servePortal(CLIENT_ADMIN, {
      'POST /v1/portal/pqrsf': () =>
        json({ id: TICKET_ID, code: 'PQRSF-2026-0007', due_on: '2026-11-28' }, 201),
    });
    show(<PortalSupportPage />);
    expect(await screen.findByText('No ha radicado PQRSF')).toBeVisible();
    await userEvent.click(screen.getByRole('button', { name: 'Radicar PQRSF' }));
    const dialog = await screen.findByRole('dialog');
    await userEvent.selectOptions(within(dialog).getByLabelText('Tipo'), 'complaint');
    await userEvent.type(within(dialog).getByLabelText('Asunto'), 'Demora');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Radicar' }));
    expect(within(dialog).getAllByText(/al menos 10 letras/u).length).toBeGreaterThan(0);
    await userEvent.type(
      within(dialog).getByLabelText('Cuéntenos'),
      'La entrega se demoró dos semanas.',
    );
    await userEvent.click(within(dialog).getByRole('button', { name: 'Radicar' }));
    expect(await within(dialog).findByText(/PQRSF-2026-0007/u)).toBeVisible();
    await userEvent.click(within(dialog).getByRole('button', { name: 'Listo' }));
  });
});

describe('PQRSF respondida y ayuda', () => {
  it('muestra la respuesta de una PQRSF respondida y busca en la ayuda', async () => {
    const sent = servePortal(CLIENT_ADMIN, {
      'GET /v1/portal/pqrsf': () =>
        json({
          data: [
            {
              id: TICKET_ID,
              code: 'PQRSF-2026-0003',
              type: 'claim',
              subject: 'Cobro repetido',
              status: 'closed',
              received_at: '2026-11-01T15:00:00.000Z',
              due_on: '2026-11-22',
              responded_at: '2026-11-05T15:00:00.000Z',
              response: 'Ya devolvimos el valor.',
            },
          ],
        }),
    });
    show(<PortalSupportPage />);
    expect(await screen.findByText('Ya devolvimos el valor.')).toBeVisible();
    await userEvent.type(screen.getByLabelText('Buscar en la ayuda'), 'factura');
    await vi.waitFor(() => {
      expect(sent.some((r) => r.search === '?q=factura')).toBe(true);
    });
  });
});

describe('una solicitud', () => {
  it('muestra la conversación pública y envía la respuesta del cliente', async () => {
    const sent = servePortal(CLIENT_ADMIN, {
      [`POST /v1/portal/tickets/${TICKET_ID}/messages`]: () => json({ id: TICKET_ID }, 201),
    });
    show(<PortalTicketPage id={TICKET_ID} />);
    expect(await screen.findByText('Esta solicitud espera su respuesta.')).toBeVisible();
    expect(screen.getByText('¿Desde qué navegador lo abre?')).toBeVisible();
    await userEvent.click(screen.getByRole('button', { name: 'Enviar respuesta' }));
    expect(screen.getByText('Escriba el mensaje.')).toBeVisible();
    await userEvent.type(screen.getByLabelText('Su respuesta'), 'Desde el celular.');
    await userEvent.click(screen.getByRole('button', { name: 'Enviar respuesta' }));
    await vi.waitFor(() => {
      const reply = sent.find((r) => r.method === 'POST');
      expect(reply?.body).toEqual({ body: 'Desde el celular.' });
    });
  });

  it('una solicitud cerrada muestra la solución y no deja responder', async () => {
    servePortal(CLIENT_ADMIN, {
      [`GET /v1/portal/tickets/${TICKET_ID}`]: () =>
        json(
          ticketDetail({
            status: 'closed',
            can_reply: false,
            messages: [],
            resolution: 'Se reinició el servicio.',
          }),
        ),
    });
    show(<PortalTicketPage id={TICKET_ID} />);
    expect(await screen.findByText(/Se reinició el servicio/u)).toBeVisible();
    expect(screen.getByText('Aún no hay mensajes del equipo de soporte.')).toBeVisible();
    expect(screen.queryByLabelText('Su respuesta')).toBeNull();
  });

  it('abre un artículo de ayuda', async () => {
    servePortal(CLIENT_ADMIN);
    show(<PortalArticlePage id={ARTICLE_ID} />);
    expect(await screen.findByText('Entre a Facturas.')).toBeVisible();
  });
});

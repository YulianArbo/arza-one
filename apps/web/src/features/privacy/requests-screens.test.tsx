import { screen, within } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import type { ReactNode } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { apiError, json, noContent, renderWithApi } from '../../test-support/fake-api';
import { Screen, servePrivacy } from '../../test-support/privacy-fixtures';
import {
  DPO,
  EXPORT_ID,
  REQUEST_ID,
  requestDetail,
  requestSummary,
  verifiedDetail,
} from '../../test-support/privacy-request-fixtures';
import { RequestDetail } from './request-detail';
import { RequestsPanel } from './requests-panel';

// Pantallas de las solicitudes de titulares (B42): la bandeja con sus plazos, el registro interno,
// los pasos de la ficha según el estado y el permiso, la entrega y la supresión de datos.

vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace: vi.fn(), push: vi.fn() }),
  usePathname: () => '/app/privacidad/solicitudes',
}));

afterEach(() => {
  vi.unstubAllGlobals();
});

function render(ui: ReactNode): void {
  renderWithApi(<Screen>{ui}</Screen>);
}

const DETAIL_PATH = `GET /v1/privacy-requests/${REQUEST_ID}`;

describe('bandeja', () => {
  it('muestra el plazo, lo vencido y lo suspendido', async () => {
    servePrivacy(DPO, {
      'GET /v1/privacy-requests': () =>
        json({
          data: [
            requestSummary(),
            requestSummary({
              id: '01999a00-0000-7000-8000-00000000e002',
              code: 'PRV-2026-0002',
              overdue: true,
            }),
            requestSummary({
              id: '01999a00-0000-7000-8000-00000000e003',
              code: 'PRV-2026-0003',
              paused: true,
              due_on: null,
            }),
          ],
          next_cursor: null,
        }),
    });
    render(<RequestsPanel />);
    expect(await screen.findByText('PRV-2026-0001')).toBeInTheDocument();
    expect(screen.getByText(/Vencida:/u)).toBeInTheDocument();
    expect(screen.getByText('Plazo suspendido')).toBeInTheDocument();
  });
});

describe('bandeja', () => {
  it('sin solicitudes explica de dónde llegan', async () => {
    servePrivacy(DPO, {
      'GET /v1/privacy-requests': () => json({ data: [], next_cursor: null }),
    });
    render(<RequestsPanel />);
    expect(await screen.findByText('No hay solicitudes')).toBeInTheDocument();
  });
});

describe('bandeja', () => {
  it('registra una solicitud que llegó por correo', async () => {
    const sent = servePrivacy(DPO, {
      'GET /v1/privacy-requests': () => json({ data: [], next_cursor: null }),
      'POST /v1/privacy-requests': () => json({ id: REQUEST_ID }, 201),
    });
    render(<RequestsPanel />);
    await userEvent.click(await screen.findByRole('button', { name: 'Registrar solicitud' }));
    const dialog = await screen.findByRole('dialog');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Registrar' }));
    expect(await within(dialog).findAllByText(/nombre completo/iu)).not.toHaveLength(0);
    await userEvent.type(within(dialog).getByLabelText('Nombre del titular'), 'Titular Ficticio');
    await userEvent.type(within(dialog).getByLabelText('Qué pide'), 'Quiero conocer mis datos.');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Registrar' }));
    await vi.waitFor(() => {
      expect(sent.find((request) => request.method === 'POST')?.body).toMatchObject({
        channel: 'email',
        right: 'know',
        requester_name: 'Titular Ficticio',
      });
    });
  });
});

describe('ficha', () => {
  it('recibida: se empieza la verificación con la versión vista', async () => {
    const sent = servePrivacy(DPO, {
      [DETAIL_PATH]: () => json(requestDetail()),
      [`POST /v1/privacy-requests/${REQUEST_ID}/actions/start-verification`]: () => noContent(),
    });
    render(<RequestDetail id={REQUEST_ID} />);
    await userEvent.click(await screen.findByRole('button', { name: 'Empezar la verificación' }));
    await vi.waitFor(() => {
      expect(sent.find((request) => request.method === 'POST')?.headers['If-Match']).toBe('"1"');
    });
    expect(screen.getAllByText('Recibida').length).toBeGreaterThan(0);
  });
});

describe('ficha', () => {
  it('verificar exige elegir a la persona y decir qué revisó', async () => {
    const sent = servePrivacy(DPO, { [DETAIL_PATH]: () => json(requestDetail()) });
    render(<RequestDetail id={REQUEST_ID} />);
    await userEvent.click(await screen.findByRole('button', { name: 'Verificar la identidad' }));
    const dialog = await screen.findByRole('dialog');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Verificar' }));
    expect(
      (await within(dialog).findAllByText('Elija a la persona registrada en Terceros.')).length,
    ).toBeGreaterThan(0);
    expect(sent.some((request) => request.method === 'POST')).toBe(false);
  });
});

describe('ficha', () => {
  it('en trámite: responde, prepara la entrega y descarga el PDF listo', async () => {
    const ready = {
      id: EXPORT_ID,
      status: 'ready',
      requested_at: '2026-11-22T15:00:00.000Z',
      ready_at: '2026-11-22T15:01:00.000Z',
      pdf_file_id: EXPORT_ID,
    };
    const sent = servePrivacy(DPO, {
      [DETAIL_PATH]: () => json(verifiedDetail({ exports: [ready] })),
      'POST /v1/parties/01999a00-0000-7000-8000-00000000d402/personal-data/export': () =>
        json({ id: EXPORT_ID }, 201),
    });
    render(<RequestDetail id={REQUEST_ID} />);
    expect(await screen.findByRole('button', { name: 'Responder' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Descargar PDF' })).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Preparar la entrega de sus datos' }));
    await vi.waitFor(() => {
      expect(sent.find((request) => request.method === 'POST')?.body).toEqual({
        request_id: REQUEST_ID,
      });
    });
  });
});

describe('ficha', () => {
  it('supresión: pide confirmar y muestra el resultado por módulo', async () => {
    const erasure = {
      erased_at: '2026-11-22T16:00:00.000Z',
      sections: [
        {
          key: '0-party',
          title: 'Ficha en Terceros',
          outcome: 'blocked',
          count: 1,
          reason: 'Historia laboral.',
        },
        { key: 'web', title: 'Sitio web', outcome: 'erased', count: 2, reason: null },
      ],
    };
    servePrivacy(DPO, {
      [DETAIL_PATH]: () => json(verifiedDetail({ right: 'erase', kind: 'claim', erasure })),
    });
    render(<RequestDetail id={REQUEST_ID} />);
    expect(await screen.findByText('Bloqueado por deber legal')).toBeInTheDocument();
    expect(screen.getByText('Historia laboral.')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Suprimir sus datos' })).toBeNull();
  });
});

describe('ficha', () => {
  it('muestra el error de la API al suprimir con una cuenta activa', async () => {
    servePrivacy(DPO, {
      [DETAIL_PATH]: () => json(verifiedDetail({ right: 'erase', kind: 'claim' })),
      'POST /v1/parties/01999a00-0000-7000-8000-00000000d402/personal-data/erase': () =>
        apiError(409, 'PRIVACY_ACCOUNT_ACTIVE', 'El titular tiene una cuenta activa en el portal.'),
    });
    render(<RequestDetail id={REQUEST_ID} />);
    await userEvent.click(await screen.findByRole('button', { name: 'Suprimir sus datos' }));
    const dialog = await screen.findByRole('dialog');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Sí, suprimir los datos' }));
    expect(await within(dialog).findByText(/cuenta activa/u)).toBeInTheDocument();
  });
});

describe('ficha', () => {
  it('un reclamo suspendido dice qué se le pidió al titular', async () => {
    const requirement = {
      text: 'Envíe la copia de su cédula.',
      sent_at: '2026-11-21T15:00:00.000Z',
      answered_at: null,
    };
    servePrivacy(DPO, {
      [DETAIL_PATH]: () =>
        json(
          requestDetail({
            kind: 'claim',
            right: 'rectify',
            paused: true,
            due_on: null,
            requirement,
          }),
        ),
    });
    render(<RequestDetail id={REQUEST_ID} />);
    expect(await screen.findByText(/Plazo suspendido: se le pidió/u)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Registrar lo que completó' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Ampliar el plazo' })).toBeNull();
  });
});

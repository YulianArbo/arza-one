import { screen, within } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import type { ReactNode } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { json, mockApi, noContent, renderWithApi } from '../../test-support/fake-api';
import { Screen, servePrivacy } from '../../test-support/privacy-fixtures';
import {
  DPO,
  INCIDENT_ID,
  REQUEST_ID,
  incidentDetail,
  requestDetail,
  verifiedDetail,
} from '../../test-support/privacy-request-fixtures';
import { PublicPrivacyStatusLookup } from '../care-site/public-privacy-status';
import { IncidentDetail } from './incident-detail';
import { IncidentsPanel } from './incidents-panel';
import { RequestDetail } from './request-detail';

// Casos de borde de las pantallas de B42: más estados de la ficha, los formularios de los pasos,
// el registro de un incidente y la consulta pública ya respondida. Datos ficticios.

vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace: vi.fn(), push: vi.fn() }),
  usePathname: () => '/app/privacidad',
}));

afterEach(() => {
  vi.unstubAllGlobals();
});

function render(ui: ReactNode): void {
  renderWithApi(<Screen>{ui}</Screen>);
}

const DETAIL = `GET /v1/privacy-requests/${REQUEST_ID}`;
const ACTIONS = `/v1/privacy-requests/${REQUEST_ID}/actions`;

async function openDialog(name: string): Promise<HTMLElement> {
  await userEvent.click(await screen.findByRole('button', { name }));
  return screen.findByRole('dialog');
}

describe('ficha de la solicitud', () => {
  it('vencida, con prórroga y trasladada desde una PQRSF', async () => {
    servePrivacy(DPO, {
      [DETAIL]: () =>
        json(
          verifiedDetail({
            overdue: true,
            extended: true,
            extension_reason: 'Varios módulos.',
            channel: 'pqrsf',
            source_code: 'PQRSF-2026-0004',
            requester_email: null,
            requester_phone: '3000000000',
          }),
        ),
    });
    render(<RequestDetail id={REQUEST_ID} />);
    expect(await screen.findByText(/Venció el/u)).toBeInTheDocument();
    expect(screen.getByText(/con prórroga: Varios módulos./u)).toBeInTheDocument();
    expect(screen.getByText(/PQRSF-2026-0004/u)).toBeInTheDocument();
    expect(screen.getByText('Sin correo')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Ampliar el plazo' })).toBeNull();
  });
});

describe('ficha de la solicitud', () => {
  it('un reclamo nuevo dice hasta cuándo se puede pedir completarlo y lo pide', async () => {
    const sent = servePrivacy(DPO, {
      [DETAIL]: () =>
        json(
          requestDetail({ kind: 'claim', right: 'rectify', requirement_open_until: '2026-11-27' }),
        ),
      [`POST ${ACTIONS}/require`]: () => noContent(),
    });
    render(<RequestDetail id={REQUEST_ID} />);
    expect(
      await screen.findByText(/pídale lo que falta hasta el 27\/11\/2026/u),
    ).toBeInTheDocument();
    const dialog = await openDialog('Pedir que complete el reclamo');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Enviar al titular' }));
    expect(sent.some((request) => request.method === 'POST')).toBe(false);
    await userEvent.type(
      within(dialog).getByLabelText('Qué le falta al reclamo'),
      'La copia de la cédula.',
    );
    await userEvent.click(within(dialog).getByRole('button', { name: 'Enviar al titular' }));
    await vi.waitFor(() => {
      expect(sent.find((request) => request.method === 'POST')?.body).toEqual({
        text: 'La copia de la cédula.',
      });
    });
  });
});

describe('ficha de la solicitud', () => {
  it('amplía el plazo y responde con su texto', async () => {
    const sent = servePrivacy(DPO, {
      [DETAIL]: () => json(verifiedDetail()),
      [`POST ${ACTIONS}/extend`]: () => noContent(),
      [`POST ${ACTIONS}/respond`]: () => noContent(),
    });
    render(<RequestDetail id={REQUEST_ID} />);
    const extend = await openDialog('Ampliar el plazo');
    expect(within(extend).getByText(/Suma 5 días hábiles/u)).toBeInTheDocument();
    await userEvent.type(
      within(extend).getByLabelText('Por qué necesita más tiempo'),
      'Varios módulos.',
    );
    await userEvent.click(within(extend).getByRole('button', { name: 'Ampliar el plazo' }));
    await vi.waitFor(() => {
      expect(sent.some((request) => request.path.endsWith('/extend'))).toBe(true);
    });
  });
});

describe('ficha de la solicitud', () => {
  it('respondida: muestra la respuesta, la verificación y permite cerrar', async () => {
    const sent = servePrivacy(DPO, {
      [DETAIL]: () =>
        json(
          verifiedDetail({
            status: 'responded',
            response: 'Estos son sus datos.',
            responded_at: '2026-11-24T15:00:00.000Z',
          }),
        ),
      [`POST ${ACTIONS}/close`]: () => noContent(),
    });
    render(<RequestDetail id={REQUEST_ID} />);
    expect(await screen.findByText('Estos son sus datos.')).toBeInTheDocument();
    expect(screen.getByText(/Cédula revisada./u)).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Cerrar la solicitud' }));
    await vi.waitFor(() => {
      expect(sent.some((request) => request.path.endsWith('/close'))).toBe(true);
    });
  });
});

describe('ficha de la solicitud', () => {
  it('un reclamo suspendido registra lo que completó el titular', async () => {
    const requirement = {
      text: 'La cédula.',
      sent_at: '2026-11-21T15:00:00.000Z',
      answered_at: null,
    };
    const sent = servePrivacy(DPO, {
      [DETAIL]: () =>
        json(
          verifiedDetail({
            kind: 'claim',
            right: 'rectify',
            paused: true,
            due_on: null,
            requirement,
          }),
        ),
      [`POST ${ACTIONS}/answer-requirement`]: () => noContent(),
    });
    render(<RequestDetail id={REQUEST_ID} />);
    const dialog = await openDialog('Registrar lo que completó');
    await userEvent.type(
      within(dialog).getByLabelText('Qué entregó el titular'),
      'Envió la cédula.',
    );
    await userEvent.click(within(dialog).getByRole('button', { name: 'Registrar' }));
    await vi.waitFor(() => {
      const body = sent.find((request) => request.method === 'POST')?.body as Record<
        string,
        unknown
      >;
      expect(body['note']).toBe('Envió la cédula.');
      expect(body['answered_on']).toMatch(/^\d{4}-\d{2}-\d{2}$/u);
    });
  });
});

describe('incidentes', () => {
  it('registra un incidente después de validar los datos', async () => {
    const sent = servePrivacy(DPO, {
      'GET /v1/privacy-incidents': () => json({ data: [] }),
      'POST /v1/privacy-incidents': () => json({ id: INCIDENT_ID }, 201),
    });
    render(<IncidentsPanel />);
    expect(await screen.findByText('No hay incidentes')).toBeInTheDocument();
    const dialog = await openDialog('Registrar incidente');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Registrar' }));
    expect(sent.some((request) => request.method === 'POST')).toBe(false);
    await userEvent.type(
      within(dialog).getByLabelText('Qué pasó, en una frase'),
      'Correo equivocado',
    );
    await userEvent.type(
      within(dialog).getByLabelText('Descripción'),
      'Se envió un archivo con datos de contacto a una persona externa.',
    );
    await userEvent.type(within(dialog).getByLabelText('Cuándo se detectó'), '2026-11-20T10:00');
    await userEvent.type(within(dialog).getByLabelText('Titulares afectados (aproximado)'), '12');
    await userEvent.type(
      within(dialog).getByLabelText('Código del incidente en Proyectos (opcional)'),
      'INC-2026-0003',
    );
    await userEvent.click(within(dialog).getByLabelText('Contacto'));
    await userEvent.click(within(dialog).getByLabelText('Contacto'));
    await userEvent.click(within(dialog).getByLabelText('Salud (sensible)'));
    await userEvent.click(within(dialog).getByRole('button', { name: 'Registrar' }));
    await vi.waitFor(() => {
      expect(sent.find((request) => request.method === 'POST')?.body).toMatchObject({
        affected_count: 12,
        data_categories: ['health'],
        project_incident_ref: 'INC-2026-0003',
      });
    });
  });
});

describe('incidentes', () => {
  it('reporta a la SIC y registra el aviso a los titulares', async () => {
    const sent = servePrivacy(DPO, {
      [`GET /v1/privacy-incidents/${INCIDENT_ID}`]: () =>
        json(incidentDetail({ overdue: true, sensitive: true, data_categories: ['health'] })),
      [`POST /v1/privacy-incidents/${INCIDENT_ID}/actions/report`]: () => noContent(),
    });
    render(<IncidentDetail id={INCIDENT_ID} />);
    expect(await screen.findByText(/sin reporte a la SIC/u)).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Registrar el aviso a los titulares' }),
    ).toBeInTheDocument();
    const dialog = await openDialog('Registrar el reporte a la SIC');
    await userEvent.type(within(dialog).getByLabelText('Radicado de la SIC'), 'SIC-2026-1');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Guardar' }));
    await vi.waitFor(() => {
      expect(sent.find((request) => request.method === 'POST')?.body).toMatchObject({
        reference: 'SIC-2026-1',
      });
    });
  });
});

describe('consulta pública', () => {
  it('ya respondida muestra la respuesta; sin requerimiento, la fecha límite', async () => {
    const answered = {
      code: 'PRV-2026-0007',
      right: 'know',
      kind: 'inquiry',
      status: 'responded',
      received_at: '2026-11-23T15:00:00.000Z',
      due_on: '2026-12-07',
      requirement: null,
      responded_at: '2026-11-25T15:00:00.000Z',
      response: 'Estos son sus datos.',
    };
    mockApi({ 'POST /v1/public/privacy-requests/status': () => json(answered) });
    renderWithApi(<PublicPrivacyStatusLookup />);
    await userEvent.click(screen.getByRole('button', { name: 'Consultar' }));
    expect((await screen.findAllByText(/Escriba el código/u)).length).toBeGreaterThan(0);
    await userEvent.type(screen.getByLabelText('Código (PRV-…)'), 'PRV-2026-0007');
    await userEvent.type(
      screen.getByLabelText('Correo con que la presentó'),
      'titular@ejemplo.test',
    );
    await userEvent.click(screen.getByRole('button', { name: 'Consultar' }));
    expect(await screen.findByText('Estos son sus datos.')).toBeInTheDocument();
  });
});

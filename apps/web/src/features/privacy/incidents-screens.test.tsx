import { screen, within } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import type { ReactNode } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { json, noContent, renderWithApi } from '../../test-support/fake-api';
import { Screen, servePrivacy } from '../../test-support/privacy-fixtures';
import { DPO, INCIDENT_ID, incidentDetail } from '../../test-support/privacy-request-fixtures';
import { CookiesPanel } from './cookies-panel';
import { IncidentDetail } from './incident-detail';
import { IncidentsPanel } from './incidents-panel';
import { PrivacyHome } from './privacy-home';

// Pantallas de incidentes y cookies (B42): el plazo para la SIC, los pasos del incidente, el cierre
// que pide motivo si no se reportó y el resumen de las elecciones de cookies.

vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace: vi.fn(), push: vi.fn() }),
  usePathname: () => '/app/privacidad/incidentes',
}));

afterEach(() => {
  vi.unstubAllGlobals();
});

function render(ui: ReactNode): void {
  renderWithApi(<Screen>{ui}</Screen>);
}

const DETAIL = `GET /v1/privacy-incidents/${INCIDENT_ID}`;

describe('incidentes', () => {
  it('la lista muestra el plazo vencido para la SIC', async () => {
    servePrivacy(DPO, {
      'GET /v1/privacy-incidents': () => json({ data: [incidentDetail({ overdue: true })] }),
    });
    render(<IncidentsPanel />);
    expect(await screen.findByText('IDP-2026-0001')).toBeInTheDocument();
    expect(screen.getByText(/Vencido:/u)).toBeInTheDocument();
  });
});

describe('incidentes', () => {
  it('cerrar sin reporte pide el motivo antes de enviar', async () => {
    const sent = servePrivacy(DPO, {
      [DETAIL]: () => json(incidentDetail()),
      [`POST /v1/privacy-incidents/${INCIDENT_ID}/actions/close`]: () => noContent(),
    });
    render(<IncidentDetail id={INCIDENT_ID} />);
    await userEvent.click(await screen.findByRole('button', { name: 'Cerrar el incidente' }));
    const dialog = await screen.findByRole('dialog');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Guardar' }));
    expect(sent.some((request) => request.method === 'POST')).toBe(false);
    await userEvent.type(
      within(dialog).getByLabelText('Por qué no se reporta a la SIC'),
      'El archivo estaba cifrado.',
    );
    await userEvent.click(within(dialog).getByRole('button', { name: 'Guardar' }));
    await vi.waitFor(() => {
      expect(sent.find((request) => request.method === 'POST')?.body).toEqual({
        not_reportable_reason: 'El archivo estaba cifrado.',
      });
    });
  });
});

describe('incidentes', () => {
  it('un incidente reportado ya no se contiene y muestra su bitácora', async () => {
    const measures = [
      {
        id: INCIDENT_ID,
        description: 'Se cambió la lista.',
        taken_on: '2026-11-21',
        recorded_by: 'Ana',
      },
    ];
    servePrivacy(DPO, {
      [DETAIL]: () =>
        json(
          incidentDetail({
            status: 'reported',
            reported_on: '2026-11-22',
            sic_reference: 'SIC-1',
            measures,
          }),
        ),
    });
    render(<IncidentDetail id={INCIDENT_ID} />);
    expect(await screen.findByText('Se cambió la lista.')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Registrar la contención' })).toBeNull();
    expect(screen.getByRole('button', { name: 'Cerrar el incidente' })).toBeInTheDocument();
  });
});

describe('cookies y entrada', () => {
  it('el resumen cuenta por categoría y por versión', async () => {
    servePrivacy(DPO, {
      'GET /v1/privacy/cookie-consents': () => json({ data: [], next_cursor: null }),
      'GET /v1/privacy/cookie-consents/report': () =>
        json({
          from: '2026-11-01',
          to: '2026-11-30',
          total: 3,
          only_necessary: 2,
          by_category: [
            { category: 'necessary', count: 3 },
            { category: 'preferences', count: 1 },
          ],
          by_version: [{ policy_version: 2, count: 3 }],
        }),
    });
    render(<CookiesPanel />);
    expect(await screen.findByText(/3 elecciones · 2 rechazaron/u)).toBeInTheDocument();
    expect(screen.getByText('Versión 2')).toBeInTheDocument();
  });
});

describe('cookies y entrada', () => {
  it('la entrada de Privacidad ofrece solicitudes, incidentes y cookies', async () => {
    servePrivacy(DPO);
    render(<PrivacyHome />);
    expect(await screen.findByText('Solicitudes de titulares')).toBeInTheDocument();
    expect(screen.getByText('Incidentes')).toBeInTheDocument();
    expect(screen.getByText('Cookies')).toBeInTheDocument();
  });
});

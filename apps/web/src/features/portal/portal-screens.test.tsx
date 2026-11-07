import { screen } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import type { ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { json, noContent, renderWithApi } from '../../test-support/fake-api';
import {
  CLIENT_ADMIN,
  CLIENT_USER,
  DOWNLOAD_LINK,
  ENVELOPE_ID,
  PROJECT_ID,
  PortalScreen,
  TERMS,
  servePortal,
  signature,
} from '../../test-support/portal-fixtures';
import { PortalDocumentsPage } from './portal-documents';
import { PortalGate } from './portal-gate';
import { PortalHomePage } from './portal-home';
import { PortalProjectPage, PortalProjectsPage } from './portal-projects';
import { PortalApprovalsPage, PortalSignaturesPage } from './portal-signatures';

// Pantallas del portal del cliente (B30): la puerta de los términos, el inicio, los proyectos, lo
// que espera su firma y los documentos. Datos ficticios.

vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace: vi.fn(), push: vi.fn(), back: vi.fn() }),
  usePathname: () => '/portal',
}));

const assign = vi.fn();

beforeEach(() => {
  vi.stubGlobal('scrollTo', vi.fn());
  vi.stubGlobal('location', { assign, href: 'http://app.test/portal', pathname: '/portal' });
  vi.stubGlobal(
    'URL',
    Object.assign(URL, { createObjectURL: vi.fn(() => 'blob:x'), revokeObjectURL: vi.fn() }),
  );
});

afterEach(() => {
  vi.unstubAllGlobals();
  assign.mockReset();
});

function show(ui: ReactNode): void {
  renderWithApi(<PortalScreen>{ui}</PortalScreen>);
}

describe('términos del primer ingreso', () => {
  it('pide aceptar los términos antes de mostrar el portal', async () => {
    const pending = { ...TERMS, status: 'pending', accepted_at: null };
    const sent = servePortal(CLIENT_ADMIN, {
      'GET /v1/portal/terms': () => json(pending),
      'POST /v1/portal/terms/acceptance': () => noContent(),
    });
    show(<PortalGate>Contenido del portal</PortalGate>);
    expect(await screen.findByText('Términos de uso del portal')).toBeVisible();
    expect(screen.queryByText('Contenido del portal')).toBeNull();
    await userEvent.click(screen.getByRole('button', { name: 'Aceptar y continuar' }));
    expect(screen.getByText('Marque la casilla para aceptar.')).toBeVisible();
    await userEvent.click(screen.getByLabelText(/Leí y acepto/u));
    await userEvent.click(screen.getByRole('button', { name: 'Aceptar y continuar' }));
    await vi.waitFor(() => {
      const accepted = sent.find((r) => r.path === '/v1/portal/terms/acceptance');
      expect(accepted?.body).toEqual({ notice_ids: TERMS.documents.map((d) => d.id) });
    });
  });

  it('avisa si el portal todavía no está disponible y muestra el portal si ya aceptó', async () => {
    servePortal(CLIENT_ADMIN, {
      'GET /v1/portal/terms': () => json({ ...TERMS, status: 'unavailable', documents: [] }),
    });
    show(<PortalGate>Contenido del portal</PortalGate>);
    expect(await screen.findByText(/todavía no está disponible/u)).toBeVisible();
    vi.unstubAllGlobals();
    servePortal(CLIENT_ADMIN);
    show(<PortalGate>Contenido del portal</PortalGate>);
    expect(await screen.findByText('Contenido del portal')).toBeVisible();
  });
});

describe('inicio', () => {
  it('muestra lo pendiente según el rol y los próximos hitos', async () => {
    servePortal(CLIENT_ADMIN);
    show(<PortalHomePage />);
    expect(
      await screen.findByRole('heading', { name: 'Bienvenido, Demo Uno S.A.S.' }),
    ).toBeVisible();
    expect(await screen.findByText('Actas por aprobar')).toBeVisible();
    expect(screen.getByRole('link', { name: /Entrega 1/u })).toHaveAttribute(
      'href',
      `/portal/proyectos/${PROJECT_ID}`,
    );
  });

  it('el usuario del cliente no ve lo que no le toca y sin hitos lo dice', async () => {
    servePortal(CLIENT_USER, {
      'GET /v1/portal/home': () =>
        json({
          company: 'Demo Uno S.A.S.',
          projects: 0,
          next_milestones: [],
          pending: { signatures: 0, approvals: 0, open_tickets: 0, waiting_tickets: 0 },
        }),
    });
    show(<PortalHomePage />);
    expect(await screen.findByText('Sin hitos próximos')).toBeVisible();
    expect(await screen.findByText('Proyectos')).toBeVisible();
    expect(screen.queryByText('Actas por aprobar')).toBeNull();
  });
});

describe('proyectos', () => {
  it('lista los proyectos con su avance y abre la ficha sin dinero', async () => {
    servePortal(CLIENT_ADMIN);
    show(<PortalProjectsPage />);
    expect(await screen.findByRole('progressbar', { name: 'Avance' })).toHaveAttribute(
      'aria-valuenow',
      '40',
    );
    show(<PortalProjectPage id={PROJECT_ID} />);
    expect(await screen.findByText('Módulo de facturas')).toBeVisible();
    expect(screen.getByText(/En firma del cliente/u)).toBeVisible();
  });

  it('sin proyectos explica a quién pedirlos', async () => {
    servePortal(CLIENT_USER, { 'GET /v1/portal/projects': () => json({ data: [] }) });
    show(<PortalProjectsPage />);
    expect(await screen.findByText('Aún no hay proyectos para mostrar')).toBeVisible();
  });
});

describe('aprobar y firmar', () => {
  it('abre la pantalla de firma con el enlace nuevo', async () => {
    const url = 'http://app.test/firmar#token=llave';
    servePortal(CLIENT_ADMIN, {
      [`POST /v1/portal/signatures/${ENVELOPE_ID}/link`]: () => json({ url }),
    });
    show(<PortalApprovalsPage />);
    await userEvent.click(await screen.findByRole('button', { name: 'Revisar y firmar' }));
    await vi.waitFor(() => {
      expect(assign).toHaveBeenCalledWith(url);
    });
  });
});

describe('firmas y contratos', () => {
  it('dice cuándo espera a otra persona y descarga el contrato firmado', async () => {
    const sent = servePortal(CLIENT_ADMIN, {
      'GET /v1/portal/signatures': () =>
        json({
          pending: [
            signature({ kind: 'contract', my_turn: false, can_sign: false }),
            signature({ id: PROJECT_ID, kind: 'amendment', can_sign: false }),
          ],
          recent: [],
        }),
      'POST /v1/portal/contracts/01999a00-0000-7000-8000-0000000fa201/link': () =>
        json(DOWNLOAD_LINK, 201),
    });
    show(<PortalSignaturesPage />);
    expect(await screen.findByText('Espera la firma de otra persona.')).toBeVisible();
    expect(screen.getByText(/su rol no le permite/u)).toBeVisible();
    expect(screen.getByText(/45.000.000/u)).toBeVisible();
    await userEvent.click(screen.getByRole('button', { name: 'Descargar firmado' }));
    await vi.waitFor(() => {
      expect(sent.some((r) => r.path === '/v1/files/download/llave')).toBe(true);
    });
  });
});

describe('sin nada por aprobar', () => {
  it('sin nada por aprobar lo dice', async () => {
    servePortal(CLIENT_ADMIN, {
      'GET /v1/portal/signatures': () => json({ pending: [], recent: [] }),
    });
    show(<PortalApprovalsPage />);
    expect(await screen.findByText('No hay actas que esperen su aprobación')).toBeVisible();
  });
});

describe('documentos', () => {
  it('descarga un documento compartido', async () => {
    const sent = servePortal(CLIENT_ADMIN, {
      'POST /v1/portal/documents/shared/01999a00-0000-7000-8000-0000000fa601/link': () =>
        json(DOWNLOAD_LINK, 201),
    });
    show(<PortalDocumentsPage />);
    await userEvent.click(
      await screen.findByRole('button', { name: 'Descargar Manual de usuario' }),
    );
    await vi.waitFor(() => {
      expect(sent.some((r) => r.path === '/v1/files/download/llave')).toBe(true);
    });
  });

  it('sin documentos lo dice', async () => {
    servePortal(CLIENT_USER, { 'GET /v1/portal/documents': () => json({ data: [] }) });
    show(<PortalDocumentsPage />);
    expect(await screen.findByText('Aún no hay documentos')).toBeVisible();
  });
});

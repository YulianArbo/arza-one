import { render, screen } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import type { ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { apiError, json, renderWithApi } from '../../test-support/fake-api';
import {
  CLIENT_ADMIN,
  CONTRACTS,
  DOCUMENTS,
  ENVELOPE_ID,
  MY_DATA,
  PROJECT,
  PROJECT_ID,
  PortalScreen,
  SHARED_ID,
  TICKET_ID,
  USERS,
  USER_ID,
  servePortal,
  signature,
  ticketDetail,
} from '../../test-support/portal-fixtures';
import { StatusBadge, signatureLine } from './portal-bits';
import { PortalDocumentsPage } from './portal-documents';
import { PortalMyDataPage } from './portal-my-data';
import { PortalProjectPage, PortalProjectsPage } from './portal-projects';
import { PortalSignaturesPage } from './portal-signatures';
import { PortalSupportPage } from './portal-support';
import { PortalTicketPage } from './portal-ticket';
import { PortalUsersPage } from './portal-users';

// Caminos poco frecuentes del portal (B30): datos vacíos, errores de la API y cuentas inactivas.
// Datos ficticios.

vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace: vi.fn(), push: vi.fn(), back: vi.fn() }),
  usePathname: () => '/portal',
}));

const FAILED = () => apiError(500, 'INTERNAL', 'Algo falló. Intente de nuevo.');

beforeEach(() => {
  vi.stubGlobal('scrollTo', vi.fn());
});

afterEach(() => {
  vi.unstubAllGlobals();
});

function show(ui: ReactNode): void {
  renderWithApi(<PortalScreen>{ui}</PortalScreen>);
}

describe('piezas comunes', () => {
  it('un estado desconocido no rompe y la firma terminada no dice vencimiento', () => {
    render(<StatusBadge status="otro" labels={{}} />);
    expect(screen.getByText('—')).toBeVisible();
    expect(signatureLine(signature({ status: 'completed', signed: 2 }))).toBe('2 de 2 firmas');
  });
});

describe('proyecto sin hitos ni entregables', () => {
  it('lo explica, y la lista muestra «Sin hitos pendientes»', async () => {
    const empty = { ...PROJECT, next_milestone: null, awaiting_client: 0, description: null };
    servePortal(CLIENT_ADMIN, {
      'GET /v1/portal/projects': () => json({ data: [empty] }),
      [`GET /v1/portal/projects/${PROJECT_ID}`]: () =>
        json({ ...empty, milestones: [], deliverables: [] }),
    });
    show(<PortalProjectsPage />);
    expect(await screen.findByText('Sin hitos pendientes')).toBeVisible();
    show(<PortalProjectPage id={PROJECT_ID} />);
    expect(await screen.findByText('El proyecto no tiene hitos todavía.')).toBeVisible();
    expect(screen.getByText('Aún no hay entregables entregados.')).toBeVisible();
  });
});

describe('entregable sin acta', () => {
  it('muestra el entregable sin versión, hito ni acta', async () => {
    const deliverable = {
      ...PROJECT.deliverables[0],
      version_label: null,
      milestone: null,
      acceptance: null,
    };
    servePortal(CLIENT_ADMIN, {
      [`GET /v1/portal/projects/${PROJECT_ID}`]: () =>
        json({ ...PROJECT, deliverables: [deliverable] }),
    });
    show(<PortalProjectPage id={PROJECT_ID} />);
    expect(await screen.findByText('Módulo de facturas')).toBeVisible();
    expect(screen.queryByText('Acta')).toBeNull();
  });
});

describe('firmas con error', () => {
  it('muestra el error al pedir el enlace y el contrato sin copia firmada ni valor', async () => {
    const contract = { ...CONTRACTS.data[0], value: null, has_signed_copy: false };
    servePortal(CLIENT_ADMIN, {
      'GET /v1/portal/signatures': () =>
        json({ pending: [signature({ kind: 'contract' })], recent: [] }),
      'GET /v1/portal/contracts': () => json({ data: [contract] }),
      [`POST /v1/portal/signatures/${ENVELOPE_ID}/link`]: FAILED,
    });
    show(<PortalSignaturesPage />);
    await userEvent.click(await screen.findByRole('button', { name: 'Revisar y firmar' }));
    expect(await screen.findByText('Algo falló. Intente de nuevo.')).toBeVisible();
    expect(screen.queryByRole('button', { name: 'Descargar firmado' })).toBeNull();
    expect(screen.queryByText('Valor')).toBeNull();
  });
});

describe('firmas vacías', () => {
  it('sin documentos por firmar ni contratos lo dice', async () => {
    servePortal(CLIENT_ADMIN, {
      'GET /v1/portal/signatures': () => json({ pending: [], recent: [] }),
      'GET /v1/portal/contracts': () => json({ data: [] }),
    });
    show(<PortalSignaturesPage />);
    expect(await screen.findByText('No hay documentos que esperen su firma')).toBeVisible();
    expect(await screen.findByText('Aún no hay contratos para mostrar')).toBeVisible();
  });
});

describe('documentos con error', () => {
  it('muestra el error de la descarga de un documento con código y sin proyecto', async () => {
    const contract = {
      ...DOCUMENTS.data[0],
      kind: 'contract',
      code: 'CTR-2026-0001',
      project: null,
    };
    servePortal(CLIENT_ADMIN, {
      'GET /v1/portal/documents': () => json({ data: [contract] }),
      [`POST /v1/portal/documents/contract/${SHARED_ID}/link`]: FAILED,
    });
    show(<PortalDocumentsPage />);
    await userEvent.click(await screen.findByRole('button', { name: /Descargar/u }));
    expect(await screen.findByText('Algo falló. Intente de nuevo.')).toBeVisible();
  });
});

describe('soporte sin datos', () => {
  it('sin artículos lo dice y el tiquete sin quien lo pidió no muestra la línea', async () => {
    servePortal(CLIENT_ADMIN, {
      'GET /v1/portal/articles': () => json({ data: [] }),
      'GET /v1/portal/tickets': () => json({ data: [ticketDetail({ requester: null })] }),
    });
    show(<PortalSupportPage />);
    expect(await screen.findByText('No encontramos artículos')).toBeVisible();
    expect(await screen.findByText('No abre el reporte')).toBeVisible();
    expect(screen.queryByText('Pidió')).toBeNull();
  });
});

describe('solicitud con error', () => {
  it('muestra el mensaje del cliente y el error al responder', async () => {
    const message = {
      id: '01999a00-0000-7000-8000-0000000fa399',
      author: 'Ana Cliente',
      from_client: true,
      body: 'Sigue igual.',
      created_at: '2026-11-07T16:00:00.000Z',
    };
    servePortal(CLIENT_ADMIN, {
      [`GET /v1/portal/tickets/${TICKET_ID}`]: () =>
        json(ticketDetail({ status: 'in_progress', project: null, messages: [message] })),
      [`POST /v1/portal/tickets/${TICKET_ID}/messages`]: FAILED,
    });
    show(<PortalTicketPage id={TICKET_ID} />);
    expect(await screen.findByText('Usted o su empresa')).toBeVisible();
    await userEvent.type(screen.getByLabelText('Su respuesta'), 'Hola');
    await userEvent.click(screen.getByRole('button', { name: 'Enviar respuesta' }));
    expect(await screen.findByText('Algo falló. Intente de nuevo.')).toBeVisible();
  });
});

describe('usuarios inactivos e invitados', () => {
  it('ofrece activar al inactivo y muestra el error del cambio', async () => {
    const inactive = { ...USERS.data[1], status: 'inactive', last_login_at: null };
    const invited = {
      ...USERS.data[1],
      id: PROJECT_ID,
      name: 'Otra Administradora',
      role: 'CLIENTE_ADMIN',
      status: 'invited',
    };
    servePortal(CLIENT_ADMIN, {
      'GET /v1/portal/users': () => json({ ...USERS, data: [USERS.data[0], inactive, invited] }),
      [`PUT /v1/portal/users/${USER_ID}`]: FAILED,
    });
    show(<PortalUsersPage />);
    await userEvent.click(await screen.findByRole('button', { name: 'Activar' }));
    expect(await screen.findByText('Algo falló. Intente de nuevo.')).toBeVisible();
    expect(screen.getByText('Invitado')).toBeVisible();
    expect(screen.getAllByRole('button', { name: 'Guardar proyectos' })).toHaveLength(1);
  });
});

describe('mis datos incompletos y con error', () => {
  it('muestra guiones donde no hay dato y los errores de guardar y descargar', async () => {
    const bare = {
      ...MY_DATA,
      display_name: null,
      company: null,
      role: null,
      second_factor: false,
      last_login_at: null,
      terms_accepted_at: null,
    };
    servePortal(CLIENT_ADMIN, {
      'GET /v1/portal/me': () => json(bare),
      'PUT /v1/portal/me': FAILED,
      'POST /v1/portal/me/export': FAILED,
    });
    show(<PortalMyDataPage />);
    expect(await screen.findByText('Opcional')).toBeVisible();
    await userEvent.type(screen.getByLabelText('Su nombre'), 'Ana');
    await userEvent.click(screen.getByRole('button', { name: 'Guardar' }));
    await userEvent.click(screen.getByRole('button', { name: 'Descargar mis datos' }));
    expect((await screen.findAllByText('Algo falló. Intente de nuevo.')).length).toBe(2);
  });
});

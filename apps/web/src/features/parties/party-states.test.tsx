import { screen, within } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { Screen } from '../../test-support/core-fixtures';
import { SESSION, apiError, json, noContent, renderWithApi } from '../../test-support/fake-api';
import {
  CONTACTS,
  FINANCE,
  ORGANIZATION,
  ORG_ID,
  PERSON_ID,
  REVIEWS,
  SALES,
  TIMELINE,
  serveParties,
} from '../../test-support/party-fixtures';
import { PartyDetailPanel } from './party-detail';
import { PartyForm } from './party-form';
import { PartyList } from './party-list';

// Estados de las pantallas de terceros (numeral 16.5): vacíos, errores y variantes por tipo.

vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace: vi.fn(), push: vi.fn(), back: vi.fn() }),
  usePathname: () => '/app/terceros',
}));

const PERSON = {
  ...ORGANIZATION,
  id: PERSON_ID,
  kind: 'person',
  name: 'Laura Gómez Ríos',
  first_name: 'Laura',
  last_name: 'Gómez Ríos',
  legal_name: null,
  trade_name: null,
  id_type: 'CC',
  id_number: '1020555001',
  check_digit: null,
  status: 'blocked',
  status_reason: 'Lista restrictiva',
  authorizations: [
    {
      id: '01999a00-0000-7000-8000-00000000f501',
      notice: {
        id: '01999a00-0000-7000-8000-00000000f401',
        key: 'authorization_contact',
        label: 'Autorización de contactos',
        version_number: 2,
        title: 'Autorización de contactos',
      },
      purposes: ['COMMERCIAL'],
      channel: 'written',
      granted_on: '2026-01-15',
      status: 'active',
      revoked_at: null,
    },
  ],
  role_history: [],
  roles: [],
  due_diligence: { state: 'none', next_review_on: null },
  has_logo: false,
};

const EMPTY = { data: [] };

beforeEach(() => {
  vi.stubGlobal('scrollTo', vi.fn());
});

afterEach(() => {
  vi.unstubAllGlobals();
});

function renderParty(id: string): void {
  renderWithApi(
    <Screen>
      <PartyDetailPanel id={id} />
    </Screen>,
  );
}

async function openTab(name: string): Promise<void> {
  await userEvent.click(await screen.findByRole('tab', { name }));
}

describe('ficha de una persona', () => {
  it('muestra su autorización, el motivo del bloqueo y dónde es contacto', async () => {
    serveParties(FINANCE, {
      [`GET /v1/parties/${PERSON_ID}`]: () => json(PERSON),
      [`GET /v1/parties/${PERSON_ID}/contacts`]: () => json(CONTACTS),
    });
    renderParty(PERSON_ID);
    expect(
      await screen.findByText('Relación comercial · Documento firmado · 15/01/2026'),
    ).toBeVisible();
    expect(screen.getByText('Autorización de contactos, versión 2')).toBeVisible();
    expect(screen.getByText('Lista restrictiva')).toBeVisible();
    expect(screen.getByText('Sin conocimiento del tercero')).toBeVisible();
    expect(screen.getByRole('button', { name: 'Desbloquear' })).toBeVisible();
    await openTab('Contactos');
    expect(await screen.findByRole('link', { name: ORGANIZATION.name })).toBeVisible();
    expect(screen.queryByRole('button', { name: 'Agregar un contacto' })).toBeNull();
  });
});

describe('pestañas sin registros', () => {
  it('cada pestaña explica qué verá allí', async () => {
    serveParties(FINANCE, {
      [`GET /v1/parties/${ORG_ID}/contacts`]: () => json(EMPTY),
      [`GET /v1/parties/${ORG_ID}/bank-accounts`]: () => json(EMPTY),
      [`GET /v1/parties/${ORG_ID}/due-diligence`]: () => json(EMPTY),
      [`GET /v1/parties/${ORG_ID}/timeline`]: () => json({ data: [], next_cursor: null }),
    });
    renderParty(ORG_ID);
    await openTab('Contactos');
    expect(await screen.findByText('Todavía no hay contactos')).toBeVisible();
    await openTab('Cuentas bancarias');
    expect(await screen.findByText('Todavía no hay cuentas bancarias')).toBeVisible();
    await openTab('Conocimiento');
    expect(await screen.findByText('Todavía no hay conocimiento del tercero')).toBeVisible();
    await openTab('Línea de tiempo');
    expect(await screen.findByText('Todavía no hay movimientos')).toBeVisible();
  });
});

describe('pestañas sin registros (2)', () => {
  it('una revisión propia no se ofrece aprobar y la del sistema se nombra así', async () => {
    const own = { ...REVIEWS.data[0], requested_by: { id: SESSION.user.id, display_name: 'Ana' } };
    const system = { ...TIMELINE.data[0], actor_name: null, action: 'party.desconocida' };
    serveParties(FINANCE, {
      [`GET /v1/parties/${ORG_ID}/due-diligence`]: () => json({ data: [own] }),
      [`GET /v1/parties/${ORG_ID}/timeline`]: () => json({ data: [system], next_cursor: null }),
    });
    renderParty(ORG_ID);
    await openTab('Conocimiento');
    expect(await screen.findByText('Usted lo registró: lo revisa otra persona.')).toBeVisible();
    await openTab('Línea de tiempo');
    expect(await screen.findByText('party.desconocida')).toBeVisible();
    expect(screen.getByText(/El sistema/)).toBeVisible();
  });
});

describe('errores', () => {
  it('una ficha que no existe muestra el error con reintento', async () => {
    serveParties(SALES, {
      [`GET /v1/parties/${ORG_ID}`]: () =>
        apiError(404, 'PARTY_NOT_FOUND', 'El tercero no existe.'),
    });
    renderParty(ORG_ID);
    expect(await screen.findByText('El tercero no existe.')).toBeVisible();
  });
});

describe('errores (2)', () => {
  it('la fusión sin posibles duplicados lo dice', async () => {
    serveParties(SALES);
    renderParty(ORG_ID);
    await userEvent.click(await screen.findByRole('button', { name: 'Fusionar un duplicado' }));
    const dialog = await screen.findByRole('dialog');
    expect(
      await within(dialog).findByText('No se encontraron posibles duplicados de este tercero.'),
    ).toBeVisible();
  });
});

describe('edición y listado filtrado', () => {
  it('edita una organización con la versión vista', async () => {
    const sent = serveParties(SALES, { [`PATCH /v1/parties/${ORG_ID}`]: () => noContent() });
    const onSaved = vi.fn();
    const party = { ...ORGANIZATION, kind: 'organization' as const, status: 'active' as const };
    renderWithApi(
      <Screen>
        <PartyForm party={party} onSaved={onSaved} />
      </Screen>,
    );
    const city = await screen.findByLabelText('Ciudad (opcional)');
    await userEvent.clear(city);
    await userEvent.type(city, 'Cali');
    await userEvent.click(screen.getByRole('button', { name: 'Guardar' }));
    await vi.waitFor(() => {
      expect(onSaved).toHaveBeenCalled();
    });
    const patch = sent.find((r) => r.method === 'PATCH');
    expect(patch?.headers['If-Match']).toBe('"2"');
    expect(patch?.body).toMatchObject({ city: 'Cali', legal_name: ORGANIZATION.name });
    expect(screen.queryByLabelText('Tipo de tercero')).toBeNull();
  });
});

describe('edición y listado filtrado (2)', () => {
  it('con filtros y sin resultados lo explica y pasa de página', async () => {
    serveParties(SALES, {
      'GET /v1/parties': (request) =>
        request.search.includes('q=')
          ? json({ data: [], next_cursor: null })
          : json({ data: [], next_cursor: ORG_ID }),
    });
    renderWithApi(
      <Screen>
        <PartyList />
      </Screen>,
    );
    await userEvent.click(await screen.findByRole('button', { name: 'Página siguiente' }));
    await userEvent.type(screen.getByLabelText('Buscar por nombre, documento o correo'), 'zzz');
    await userEvent.click(screen.getByRole('button', { name: 'Buscar' }));
    expect(await screen.findByText('No hay terceros con esos filtros')).toBeVisible();
  });
});

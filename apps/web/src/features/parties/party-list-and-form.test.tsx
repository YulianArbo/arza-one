import { screen } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { Screen } from '../../test-support/core-fixtures';
import { apiError, json, renderWithApi } from '../../test-support/fake-api';
import {
  DUPLICATE_SUMMARY,
  ORG_ID,
  SALES,
  permissionsOf,
  serveParties,
} from '../../test-support/party-fixtures';
import { PartyForm } from './party-form';
import { PartyList } from './party-list';

const push = vi.fn();

vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace: vi.fn(), push, back: vi.fn() }),
  usePathname: () => '/app/terceros',
}));

beforeEach(() => {
  vi.stubGlobal('scrollTo', vi.fn());
});

afterEach(() => {
  vi.unstubAllGlobals();
  push.mockReset();
});

describe('listado de terceros', () => {
  it('muestra los terceros y busca con los filtros', async () => {
    const sent = serveParties(SALES);
    renderWithApi(
      <Screen>
        <PartyList />
      </Screen>,
    );
    expect(
      await screen.findByRole('link', { name: 'Comercializadora Andina S.A.S.' }),
    ).toBeVisible();
    expect(screen.getByText('NIT 800197268-4')).toBeVisible();
    expect(screen.getByRole('link', { name: 'Registrar un tercero' })).toBeVisible();
    await userEvent.type(screen.getByLabelText('Buscar por nombre, documento o correo'), 'andina');
    await userEvent.selectOptions(screen.getByLabelText('Papel'), 'supplier');
    await userEvent.click(screen.getByRole('button', { name: 'Buscar' }));
    await vi.waitFor(() => {
      expect(sent.at(-1)?.search).toBe('?q=andina&role=supplier');
    });
  });
});

describe('listado de terceros (2)', () => {
  it('sin terceros invita a registrar el primero; sin permiso de crear, no', async () => {
    serveParties(permissionsOf(['party.read']), {
      'GET /v1/parties': () => json({ data: [], next_cursor: null }),
    });
    renderWithApi(
      <Screen>
        <PartyList />
      </Screen>,
    );
    expect(await screen.findByText('Todavía no hay terceros')).toBeVisible();
    expect(screen.queryByRole('link', { name: 'Registrar un tercero' })).toBeNull();
  });
});

describe('formulario del tercero', () => {
  it('revisa el dígito del NIT antes de enviar', async () => {
    const sent = serveParties(SALES);
    renderWithApi(
      <Screen>
        <PartyForm party={null} />
      </Screen>,
    );
    await userEvent.type(await screen.findByLabelText('Razón social'), 'Andina S.A.S.');
    await userEvent.type(screen.getByLabelText('Número de documento'), '800197268');
    await userEvent.type(screen.getByLabelText('Dígito de verificación'), '5');
    await userEvent.click(screen.getByRole('button', { name: 'Guardar' }));
    expect(await screen.findByText(/no corresponde a ese NIT/)).toBeVisible();
    expect(sent.some((request) => request.method === 'POST')).toBe(false);
  });
});

describe('formulario del tercero (2)', () => {
  it('registra una persona con su autorización y abre su ficha', async () => {
    const sent = serveParties(SALES, {
      'POST /v1/parties': () => json({ id: ORG_ID }, 201),
    });
    renderWithApi(
      <Screen>
        <PartyForm party={null} />
      </Screen>,
    );
    await userEvent.selectOptions(await screen.findByLabelText('Tipo de tercero'), 'person');
    await userEvent.type(screen.getByLabelText('Nombres'), 'Laura');
    await userEvent.type(screen.getByLabelText('Apellidos'), 'Gómez');
    await userEvent.type(screen.getByLabelText('Número de documento'), '1020555001');
    await userEvent.click(screen.getByRole('button', { name: 'Guardar' }));
    expect(await screen.findAllByText('Este dato es obligatorio.')).toHaveLength(3);
    await userEvent.selectOptions(screen.getByLabelText('Finalidad'), 'COMMERCIAL');
    await userEvent.selectOptions(screen.getByLabelText('Autorización'), 'written');
    await userEvent.type(screen.getByLabelText('Fecha de la autorización'), '2026-10-01');
    await userEvent.click(screen.getByLabelText('Cliente'));
    await userEvent.click(screen.getByRole('button', { name: 'Guardar' }));
    await vi.waitFor(() => {
      expect(push).toHaveBeenCalledWith(`/app/terceros/${ORG_ID}`);
    });
    expect(sent.find((r) => r.method === 'POST')?.body).toMatchObject({
      kind: 'person',
      first_name: 'Laura',
      id_type: 'CC',
      check_digit: null,
      legal_name: null,
      data_authorization: 'written',
      roles: ['customer'],
    });
  });
});

describe('formulario del tercero (3)', () => {
  it('avisa de un posible duplicado y ofrece abrirlo', async () => {
    serveParties(SALES, {
      'GET /v1/parties/search': () =>
        json({ data: [{ party: DUPLICATE_SUMMARY, reasons: ['id_number'] }] }),
      'POST /v1/parties': () => apiError(409, 'PARTY_DUPLICATE', 'Ya existe un tercero.'),
    });
    renderWithApi(
      <Screen>
        <PartyForm party={null} />
      </Screen>,
    );
    await userEvent.type(await screen.findByLabelText('Número de documento'), '900555102');
    await userEvent.tab();
    const open = await screen.findByRole('link', { name: `Abrir ${DUPLICATE_SUMMARY.name}` });
    expect(open).toHaveAttribute('href', `/app/terceros/${DUPLICATE_SUMMARY.id}`);
    expect(screen.getByText(/mismo número de documento/)).toBeVisible();
  });
});

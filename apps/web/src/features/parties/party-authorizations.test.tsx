import { screen, within } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { Screen } from '../../test-support/core-fixtures';
import { json, renderWithApi } from '../../test-support/fake-api';
import {
  NOTICE_ID,
  ORGANIZATION,
  PERSON_ID,
  SALES,
  serveParties,
} from '../../test-support/party-fixtures';
import { PartyDetailPanel } from './party-detail';
import { PartyForm } from './party-form';

// Autorizaciones de tratamiento en las pantallas de terceros (B17): el componente de privacidad en
// el formulario de una persona y en su ficha.

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
  authorizations: [],
  role_history: [],
  roles: [],
};

beforeEach(() => {
  vi.stubGlobal('scrollTo', vi.fn());
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('autorización en la ficha de la persona', () => {
  it('registra una autorización nueva con el texto vigente', async () => {
    const sent = serveParties(SALES, {
      [`GET /v1/parties/${PERSON_ID}`]: () => json(PERSON),
      [`POST /v1/parties/${PERSON_ID}/consents`]: () => json({ id: PERSON_ID }, 201),
    });
    renderWithApi(
      <Screen>
        <PartyDetailPanel id={PERSON_ID} />
      </Screen>,
    );
    expect(
      await screen.findByText('Esta persona todavía no tiene autorizaciones registradas.'),
    ).toBeVisible();
    await userEvent.click(await screen.findByRole('button', { name: 'Registrar autorización' }));
    const dialog = await screen.findByRole('dialog');
    await userEvent.selectOptions(
      await within(dialog).findByLabelText('Texto de autorización'),
      NOTICE_ID,
    );
    await userEvent.click(within(dialog).getByLabelText('Relación comercial'));
    await userEvent.selectOptions(within(dialog).getByLabelText('Cómo se obtuvo'), 'digital');
    await userEvent.type(within(dialog).getByLabelText('Fecha de la autorización'), '2026-10-16');
    await userEvent.click(within(dialog).getByLabelText(/La persona autorizó el tratamiento/));
    await userEvent.click(within(dialog).getByRole('button', { name: 'Registrar' }));
    await vi.waitFor(() => {
      expect(sent.find((request) => request.method === 'POST')?.body).toMatchObject({
        notice_id: NOTICE_ID,
        accepted: true,
        channel: 'digital',
      });
    });
  });
});

describe('autorización sin texto publicado', () => {
  it('avisa que no se pueden registrar datos personales', async () => {
    serveParties(SALES, {
      'GET /v1/parties/authorization-notices': () => json({ data: [] }),
    });
    renderWithApi(
      <Screen>
        <PartyForm party={null} />
      </Screen>,
    );
    await userEvent.selectOptions(await screen.findByLabelText('Tipo de tercero'), 'person');
    expect(await screen.findByText('No hay un texto de autorización publicado')).toBeVisible();
  });
});

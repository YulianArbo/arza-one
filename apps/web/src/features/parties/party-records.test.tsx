import { screen, within } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { Screen } from '../../test-support/core-fixtures';
import { json, noContent, renderWithApi } from '../../test-support/fake-api';
import {
  ACCOUNT_ID,
  FINANCE,
  ORGANIZATION,
  ORG_ID,
  PERSON_ID,
  PERSON_SUMMARY,
  REVIEW_ID,
  SALES,
  serveParties,
} from '../../test-support/party-fixtures';
import { BankAccountsPanel } from './bank-accounts-panel';
import { ContactsPanel } from './contacts-panel';
import { DueDiligencePanel } from './due-diligence-panel';

// Contactos, cuentas bancarias y conocimiento del tercero (B13).

vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace: vi.fn(), push: vi.fn(), back: vi.fn() }),
  usePathname: () => `/app/terceros/${ORG_ID}`,
}));

const party = { ...ORGANIZATION, kind: 'organization' as const, status: 'active' as const };

beforeEach(() => {
  vi.stubGlobal('scrollTo', vi.fn());
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('cuentas bancarias', () => {
  it('muestra solo los últimos dígitos y el número completo a pedido', async () => {
    const sent = serveParties(FINANCE, {
      [`POST /v1/parties/${ORG_ID}/bank-accounts/${ACCOUNT_ID}/actions/reveal`]: () =>
        json({ account_number: '00123456789' }),
    });
    renderWithApi(
      <Screen>
        <BankAccountsPanel party={party} />
      </Screen>,
    );
    expect(await screen.findByText('Ahorros •••• 6789')).toBeVisible();
    expect(screen.getByText('Usted lo registró: lo revisa otra persona.')).toBeVisible();
    const [reveal] = screen.getAllByRole('button', { name: 'Ver número completo' });
    if (reveal === undefined) throw new Error('Falta el botón');
    await userEvent.click(reveal);
    expect(await screen.findByText('Número: 00123456789')).toBeVisible();
    expect(sent.some((r) => r.path.endsWith('/actions/reveal'))).toBe(true);
  });
});

describe('cuentas bancarias (2)', () => {
  it('registra una cuenta pendiente y aprueba la de otra persona', async () => {
    const sent = serveParties(FINANCE, {
      [`POST /v1/parties/${ORG_ID}/bank-accounts`]: () => json({ id: ACCOUNT_ID }, 201),
      [`POST /v1/parties/${ORG_ID}/bank-accounts/${ACCOUNT_ID}/actions/approve`]: () => noContent(),
    });
    renderWithApi(
      <Screen>
        <BankAccountsPanel party={party} />
      </Screen>,
    );
    await userEvent.click(await screen.findByRole('button', { name: 'Registrar una cuenta' }));
    const dialog = await screen.findByRole('dialog');
    await userEvent.selectOptions(within(dialog).getByLabelText('Banco'), 'BANCOLOMBIA');
    await userEvent.type(within(dialog).getByLabelText('Número de cuenta'), '0012-3456 789');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Registrar' }));
    await vi.waitFor(() => {
      expect(
        sent.find((r) => r.path.endsWith('/bank-accounts') && r.method === 'POST')?.body,
      ).toEqual({
        bank: 'BANCOLOMBIA',
        account_type: 'savings',
        account_number: '00123456789',
        replaces_id: null,
      });
    });
    await userEvent.click(screen.getByRole('button', { name: 'Aprobar' }));
    await userEvent.click(await screen.findByRole('button', { name: 'Sí, aprobar' }));
    await vi.waitFor(() => {
      expect(sent.some((r) => r.path.endsWith('/actions/approve'))).toBe(true);
    });
  });
});

describe('conocimiento del tercero', () => {
  it('registra el conocimiento y lo rechaza con motivo', async () => {
    const sent = serveParties(FINANCE, {
      [`POST /v1/parties/${ORG_ID}/due-diligence`]: () => json({ id: REVIEW_ID }, 201),
      [`POST /v1/parties/${ORG_ID}/due-diligence/${REVIEW_ID}/actions/reject`]: () => noContent(),
    });
    renderWithApi(
      <Screen>
        <DueDiligencePanel party={party} />
      </Screen>,
    );
    expect(await screen.findByText('Riesgo medio')).toBeVisible();
    await userEvent.click(screen.getByRole('button', { name: 'Registrar el conocimiento' }));
    const dialog = await screen.findByRole('dialog');
    await userEvent.selectOptions(within(dialog).getByLabelText('Nivel de riesgo'), 'high');
    await userEvent.type(within(dialog).getByLabelText(/Qué se revisó/), 'Consulta de listas.');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Registrar' }));
    await vi.waitFor(() => {
      expect(
        sent.find((r) => r.path.endsWith('/due-diligence') && r.method === 'POST')?.body,
      ).toEqual({
        risk_level: 'high',
        summary: 'Consulta de listas.',
      });
    });
    await userEvent.click(screen.getByRole('button', { name: 'Rechazar' }));
    const reject = await screen.findByRole('dialog');
    await userEvent.type(within(reject).getByLabelText('Motivo del rechazo'), 'Falta el RUT');
    await userEvent.click(within(reject).getByRole('button', { name: 'Rechazar' }));
    await vi.waitFor(() => {
      expect(sent.find((r) => r.path.endsWith('/reject'))?.body).toEqual({ note: 'Falta el RUT' });
    });
  });
});

describe('contactos', () => {
  it('agrega una persona como contacto principal y firmante', async () => {
    const sent = serveParties(SALES, {
      [`POST /v1/parties/${ORG_ID}/contacts`]: () => json({ id: PERSON_ID }, 201),
    });
    renderWithApi(
      <Screen>
        <ContactsPanel party={party} />
      </Screen>,
    );
    expect(await screen.findByText('Gerente de compras')).toBeVisible();
    await userEvent.click(screen.getByRole('button', { name: 'Agregar un contacto' }));
    const dialog = await screen.findByRole('dialog');
    await userEvent.type(within(dialog).getByLabelText('Buscar la persona'), 'Laura');
    await vi.waitFor(() => {
      expect(within(dialog).getByRole('option', { name: /Laura Gómez Ríos/ })).toBeDefined();
    });
    await userEvent.selectOptions(within(dialog).getByLabelText('Persona'), PERSON_SUMMARY.id);
    await userEvent.click(within(dialog).getByLabelText('Firmante autorizado'));
    await userEvent.click(within(dialog).getByRole('button', { name: 'Guardar' }));
    await vi.waitFor(() => {
      expect(sent.find((r) => r.method === 'POST')?.body).toEqual({
        person_id: PERSON_ID,
        job_title: null,
        is_primary: false,
        can_sign: true,
      });
    });
  });
});

describe('contactos (2)', () => {
  it('retira un contacto con confirmación', async () => {
    const sent = serveParties(SALES, {
      [`DELETE /v1/parties/${ORG_ID}/contacts/01999a00-0000-7000-8000-00000000f101`]: () =>
        noContent(),
    });
    renderWithApi(
      <Screen>
        <ContactsPanel party={party} />
      </Screen>,
    );
    await userEvent.click(await screen.findByRole('button', { name: 'Retirar' }));
    await userEvent.click(await screen.findByRole('button', { name: 'Sí, retirar' }));
    await vi.waitFor(() => {
      expect(sent.find((r) => r.method === 'DELETE')?.headers['If-Match']).toBe('"1"');
    });
  });
});

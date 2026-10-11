import { screen, within } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { Screen } from '../../test-support/core-fixtures';
import { apiError, json, renderWithApi } from '../../test-support/fake-api';
import {
  ACCOUNTS,
  ACCOUNT_ID,
  FINANCE,
  ORGANIZATION,
  ORG_ID,
  REVIEWS,
  SALES,
  serveParties,
} from '../../test-support/party-fixtures';
import { BankAccountsPanel } from './bank-accounts-panel';
import { DueDiligencePanel } from './due-diligence-panel';
import { PartyDetailPanel } from './party-detail';

// Revisiones cerradas y errores de las acciones sobre un tercero (B13).

vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace: vi.fn(), push: vi.fn(), back: vi.fn() }),
  usePathname: () => `/app/terceros/${ORG_ID}`,
}));

const party = { ...ORGANIZATION, kind: 'organization' as const, status: 'active' as const };
const REVIEWER = { id: '01999a00-0000-7000-8000-00000000a077', display_name: 'Dirección' };

beforeEach(() => {
  vi.stubGlobal('scrollTo', vi.fn());
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('revisiones cerradas', () => {
  it('el conocimiento aprobado muestra quién lo revisó y la próxima revisión', async () => {
    const approved = {
      ...REVIEWS.data[0],
      status: 'approved',
      next_review_on: '2027-10-01',
      reviewed_by: REVIEWER,
      reviewed_at: '2026-10-02T15:00:00.000Z',
      review_note: 'Sin hallazgos',
    };
    serveParties(FINANCE, {
      [`GET /v1/parties/${ORG_ID}/due-diligence`]: () => json({ data: [approved] }),
    });
    renderWithApi(
      <Screen>
        <DueDiligencePanel party={party} />
      </Screen>,
    );
    expect(await screen.findByText('Próxima revisión: 01/10/2027')).toBeVisible();
    expect(screen.getByText(/Revisó Dirección/)).toBeVisible();
    expect(screen.getByText('Motivo: Sin hallazgos')).toBeVisible();
    expect(screen.queryByRole('button', { name: 'Aprobar' })).toBeNull();
  });
});

describe('revisiones cerradas (2)', () => {
  it('una cuenta nueva puede reemplazar a una aprobada', async () => {
    const approved = { ...ACCOUNTS.data[0], status: 'approved', reviewed_by: REVIEWER };
    const replaced = { ...ACCOUNTS.data[1], status: 'replaced', review_note: 'Cambio de banco' };
    const sent = serveParties(FINANCE, {
      [`GET /v1/parties/${ORG_ID}/bank-accounts`]: () => json({ data: [approved, replaced] }),
      [`POST /v1/parties/${ORG_ID}/bank-accounts`]: () => json({ id: ACCOUNT_ID }, 201),
    });
    renderWithApi(
      <Screen>
        <BankAccountsPanel party={party} />
      </Screen>,
    );
    expect(await screen.findByText('Reemplazada')).toBeVisible();
    expect(screen.getByText('Motivo: Cambio de banco')).toBeVisible();
    await userEvent.click(screen.getByRole('button', { name: 'Registrar una cuenta' }));
    const dialog = await screen.findByRole('dialog');
    await userEvent.selectOptions(within(dialog).getByLabelText('Banco'), 'DAVIVIENDA');
    await userEvent.selectOptions(within(dialog).getByLabelText('Tipo de cuenta'), 'checking');
    await userEvent.type(within(dialog).getByLabelText('Número de cuenta'), '4567000011');
    await userEvent.selectOptions(
      within(dialog).getByLabelText('Reemplaza a (opcional)'),
      ACCOUNT_ID,
    );
    await userEvent.click(within(dialog).getByRole('button', { name: 'Registrar' }));
    await vi.waitFor(() => {
      expect(sent.find((r) => r.method === 'POST')?.body).toMatchObject({
        account_type: 'checking',
        replaces_id: ACCOUNT_ID,
      });
    });
  });
});

describe('errores de las acciones', () => {
  it('si la API rechaza, la pantalla muestra el motivo en español', async () => {
    const closed = apiError(409, 'PARTY_REVIEW_CLOSED', 'Ya fue revisado.');
    serveParties(FINANCE, {
      [`POST /v1/parties/${ORG_ID}/bank-accounts/${ACCOUNT_ID}/actions/reveal`]: () =>
        apiError(403, 'PERMISSION_DENIED', 'No tiene permiso.'),
      [`POST /v1/parties/${ORG_ID}/bank-accounts/${ACCOUNT_ID}/actions/approve`]: () => closed,
    });
    renderWithApi(
      <Screen>
        <BankAccountsPanel party={party} />
      </Screen>,
    );
    const [reveal] = await screen.findAllByRole('button', { name: 'Ver número completo' });
    if (reveal === undefined) throw new Error('Falta el botón');
    await userEvent.click(reveal);
    expect(await screen.findByText('No tiene permiso.')).toBeVisible();
    await userEvent.click(screen.getByRole('button', { name: 'Aprobar' }));
    await userEvent.click(await screen.findByRole('button', { name: 'Sí, aprobar' }));
    expect(await screen.findByText('Ya fue revisado.')).toBeVisible();
  });
});

describe('errores de las acciones (2)', () => {
  it('un cambio de estado rechazado se explica y las pestañas se recorren hacia atrás', async () => {
    serveParties(SALES, {
      [`POST /v1/parties/${ORG_ID}/actions/change-status`]: () =>
        apiError(409, 'VERSION_CONFLICT', 'Otra persona cambió este registro.'),
    });
    renderWithApi(
      <Screen>
        <PartyDetailPanel id={ORG_ID} />
      </Screen>,
    );
    await userEvent.click(await screen.findByRole('button', { name: 'Inactivar' }));
    await userEvent.click(await screen.findByRole('button', { name: 'Sí, inactivar' }));
    expect(await screen.findByText('Otra persona cambió este registro.')).toBeVisible();
    screen.getByRole('tab', { name: 'Resumen' }).focus();
    await userEvent.keyboard('{ArrowLeft}');
    expect(screen.getByRole('tab', { name: 'Línea de tiempo' })).toHaveAttribute(
      'aria-selected',
      'true',
    );
    await userEvent.keyboard('{Home}');
    expect(screen.getByRole('tab', { name: 'Resumen' })).toHaveAttribute('aria-selected', 'true');
  });
});

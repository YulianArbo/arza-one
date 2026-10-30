import { screen, within } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  ACTIVE,
  AMENDMENT,
  CONTRACT_ID,
  CONTRACT_READER,
  CONTRACT_WRITER,
  MODIFIED,
  OBLIGATION,
  detailRoute,
  serveContracts,
} from '../../test-support/contract-fixtures';
import { Screen } from '../../test-support/core-fixtures';
import { json, renderWithApi } from '../../test-support/fake-api';
import { ContractDetailPanel } from './contract-detail';
import { ContractList } from './contract-list';

// Pantallas de Contratos (B24): la lista y la ficha con su expediente en pestañas.

vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace: vi.fn(), push: vi.fn(), back: vi.fn() }),
  usePathname: () => '/app/contratos',
}));

beforeEach(() => {
  vi.stubGlobal('scrollTo', vi.fn());
});

afterEach(() => {
  vi.unstubAllGlobals();
});

function renderDetail(): void {
  renderWithApi(
    <Screen>
      <ContractDetailPanel id={CONTRACT_ID} />
    </Screen>,
  );
}

describe('lista de contratos', () => {
  it('muestra cada contrato con su estado y filtra por estado', async () => {
    const sent = serveContracts(CONTRACT_WRITER);
    renderWithApi(
      <Screen>
        <ContractList />
      </Screen>,
    );
    expect(await screen.findByRole('link', { name: 'CTR-2026-0001' })).toBeVisible();
    expect(screen.getByRole('link', { name: 'Nuevo contrato' })).toBeVisible();
    await userEvent.selectOptions(screen.getByLabelText('Estado'), 'active');
    await userEvent.click(screen.getByRole('button', { name: 'Buscar' }));
    await vi.waitFor(() => {
      expect(sent.some((request) => request.search.includes('status=active'))).toBe(true);
    });
  });
});

describe('lista de contratos', () => {
  it('sin contratos explica cómo crear el primero; quien solo lee no ve «Nuevo contrato»', async () => {
    serveContracts(CONTRACT_READER, {
      'GET /v1/contracts': () => json({ data: [], next_cursor: null }),
    });
    renderWithApi(
      <Screen>
        <ContractList />
      </Screen>,
    );
    expect(await screen.findByText('Todavía no hay contratos')).toBeVisible();
    expect(screen.queryByRole('link', { name: 'Nuevo contrato' })).toBeNull();
  });
});

describe('ficha del contrato', () => {
  it('el texto marca la cláusula modificada y deja ver la de la biblioteca', async () => {
    serveContracts(CONTRACT_WRITER, detailRoute({ ...MODIFIED, status: 'in_review' }));
    renderDetail();
    expect(await screen.findByText(/la Dirección debe revisarlas una por una/u)).toBeVisible();
    await userEvent.click(screen.getByRole('tab', { name: 'Texto' }));
    const text = screen.getByRole('list', { name: 'Texto del contrato' });
    expect(within(text).getByText('Modificada')).toBeVisible();
    expect(within(text).getByText('Nueva')).toBeVisible();
    await userEvent.click(within(text).getByText('Ver el texto de la biblioteca'));
    expect(within(text).getByText('Tres meses de garantía.')).toBeVisible();
  });
});

describe('ficha del contrato', () => {
  it('las obligaciones, los otrosíes y el expediente de un contrato vigente', async () => {
    serveContracts(
      CONTRACT_READER,
      detailRoute({ ...ACTIVE, obligations: [OBLIGATION], amendments: [AMENDMENT] }),
    );
    renderDetail();
    await userEvent.click(await screen.findByRole('tab', { name: 'Obligaciones' }));
    expect(screen.getByText('Entregar el prototipo navegable')).toBeVisible();
    expect(screen.queryByRole('button', { name: 'Marcar cumplida' })).toBeNull();
    await userEvent.click(screen.getByRole('tab', { name: 'Otrosíes' }));
    expect(screen.getByText('CTR-2026-0001-OT01')).toBeVisible();
    expect(screen.getByText(/Nuevo valor/u)).toBeVisible();
    await userEvent.click(screen.getByRole('tab', { name: 'Expediente' }));
    expect(screen.getByText(/firmada el 30\/10\/2026/u)).toBeVisible();
    expect(screen.getByText('b'.repeat(64))).toBeVisible();
  });
});

describe('ficha del contrato', () => {
  it('un contrato por vencer avisa la fecha y uno terminado muestra el motivo', async () => {
    serveContracts(CONTRACT_READER, detailRoute({ ...ACTIVE, status: 'expiring' }));
    renderDetail();
    expect(await screen.findByText(/Vence el 31\/10\/2027/u)).toBeVisible();
  });
});

describe('ficha del contrato', () => {
  it('muestra la terminación en el resumen', async () => {
    const termination = { terminated_on: '2026-12-01', reason: 'Mutuo acuerdo.', by: null };
    serveContracts(CONTRACT_READER, detailRoute({ ...ACTIVE, status: 'terminated', termination }));
    renderDetail();
    expect(await screen.findByText(/Mutuo acuerdo\./u)).toBeVisible();
    expect(screen.getByText('Terminado')).toBeVisible();
  });
});

import { screen, within } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { Screen } from '../../test-support/core-fixtures';
import { COMMERCIAL, CRM_READER, OPPORTUNITY_ID, serveCrm } from '../../test-support/crm-fixtures';
import { json, noContent, renderWithApi } from '../../test-support/fake-api';
import { FunnelBoard } from './funnel-board';

// Embudo de oportunidades (B22): tablero por etapas, «Mover a» y vista de tabla.

vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace: vi.fn(), push: vi.fn(), back: vi.fn() }),
  usePathname: () => '/app/comercial',
}));

beforeEach(() => {
  vi.stubGlobal('scrollTo', vi.fn());
});

afterEach(() => {
  vi.unstubAllGlobals();
});

function renderBoard(): void {
  renderWithApi(
    <Screen>
      <FunnelBoard />
    </Screen>,
  );
}

describe('tablero del embudo', () => {
  it('muestra una columna por etapa abierta, con su cantidad y su valor', async () => {
    serveCrm(COMMERCIAL);
    renderBoard();
    const prospecting = await screen.findByRole('region', { name: /Prospección/u });
    expect(within(prospecting).getByRole('link', { name: 'Portal de clientes' })).toBeVisible();
    // El total de la columna y el valor de su única tarjeta.
    expect(within(prospecting).getAllByText(/25\.000\.000/u)).toHaveLength(2);
    const negotiation = screen.getByRole('region', { name: /Negociación/u });
    expect(within(negotiation).getByText('Vencida')).toBeVisible();
    expect(screen.getByRole('link', { name: 'Registrar oportunidad' })).toBeVisible();
  });

  it('«Mover a» cambia la etapa con la versión que se vio', async () => {
    const sent = serveCrm(COMMERCIAL, {
      [`POST /v1/crm/opportunities/${OPPORTUNITY_ID}/actions/move`]: () => noContent(),
    });
    renderBoard();
    await userEvent.click(
      await screen.findByRole('button', { name: 'Mover OPO-2026-0001 a otra etapa' }),
    );
    await userEvent.click(await screen.findByRole('menuitem', { name: 'Propuesta' }));
    await vi.waitFor(() => {
      const move = sent.find((request) => request.path.endsWith('/actions/move'));
      expect(move?.body).toEqual({ stage: 'proposal', probability: null });
      expect(move?.headers['If-Match']).toBe('"3"');
    });
  });
});

describe('tablero del embudo: lectura y tabla', () => {
  it('quien solo lee no ve «Mover a» ni el botón de registrar', async () => {
    serveCrm(CRM_READER);
    renderBoard();
    expect(await screen.findByRole('link', { name: 'Portal de clientes' })).toBeVisible();
    expect(screen.queryByRole('button', { name: /Mover OPO/u })).toBeNull();
    expect(screen.queryByRole('link', { name: 'Registrar oportunidad' })).toBeNull();
  });

  it('la tabla lista las oportunidades y filtra las cerradas', async () => {
    const sent = serveCrm(COMMERCIAL);
    renderBoard();
    await userEvent.click(await screen.findByRole('button', { name: 'Tabla' }));
    expect(await screen.findByRole('columnheader', { name: 'Cliente' })).toBeVisible();
    await userEvent.selectOptions(screen.getByLabelText('Mostrar'), 'closed');
    await vi.waitFor(() => {
      expect(sent.at(-1)?.search).toBe('?view=closed&limit=200');
    });
  });

  it('sin oportunidades invita a registrar la primera', async () => {
    serveCrm(COMMERCIAL, {
      'GET /v1/crm/opportunities': () => json({ data: [], next_cursor: null }),
    });
    renderBoard();
    expect(await screen.findByText('No hay oportunidades aquí')).toBeVisible();
  });
});

import { screen, within } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { Screen } from '../../test-support/core-fixtures';
import { json, noContent, renderWithApi } from '../../test-support/fake-api';
import {
  DUPLICATE_ID,
  DUPLICATE_SUMMARY,
  FINANCE,
  ORG_ID,
  SALES,
  permissionsOf,
  serveParties,
} from '../../test-support/party-fixtures';
import { PartyDetailPanel } from './party-detail';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace: vi.fn(), push: vi.fn(), back: vi.fn() }),
  usePathname: () => `/app/terceros/${ORG_ID}`,
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
      <PartyDetailPanel id={ORG_ID} />
    </Screen>,
  );
}

describe('ficha del tercero', () => {
  it('muestra el estado, si está apto y las pestañas que el rol puede ver', async () => {
    serveParties(SALES);
    renderDetail();
    expect(
      await screen.findByRole('heading', { name: 'Comercializadora Andina S.A.S.' }),
    ).toBeVisible();
    expect(screen.getByText('Apto: conocimiento aprobado')).toBeVisible();
    const tabs = within(screen.getByRole('tablist')).getAllByRole('tab');
    expect(tabs.map((tab) => tab.textContent)).toEqual([
      'Resumen',
      'Contactos',
      'Conocimiento',
      'Comentarios y adjuntos',
      'Línea de tiempo',
    ]);
    expect(screen.getByText('Desde el 15/01/2026')).toBeVisible();
    expect(screen.getByText('Terminado')).toBeVisible();
  });
});

describe('ficha del tercero (2)', () => {
  it('se recorre con el teclado y muestra la línea de tiempo en español', async () => {
    serveParties(SALES);
    renderDetail();
    const first = await screen.findByRole('tab', { name: 'Resumen' });
    first.focus();
    await userEvent.keyboard('{End}');
    expect(screen.getByRole('tab', { name: 'Línea de tiempo' })).toHaveAttribute(
      'aria-selected',
      'true',
    );
    expect(await screen.findByText('Fusionó un tercero duplicado')).toBeVisible();
    await userEvent.keyboard('{ArrowRight}');
    expect(screen.getByRole('tab', { name: 'Resumen' })).toHaveAttribute('aria-selected', 'true');
  });
});

describe('ficha del tercero (3)', () => {
  it('sin permiso de editar no ofrece acciones', async () => {
    serveParties(permissionsOf(['party.read']));
    renderDetail();
    await screen.findByRole('heading', { name: 'Comercializadora Andina S.A.S.' });
    expect(screen.queryByRole('button', { name: 'Editar' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Bloquear' })).toBeNull();
    expect(screen.queryByRole('button', { name: /Agregar el papel/ })).toBeNull();
  });
});

describe('estados y papeles', () => {
  it('bloquear pide el motivo y envía la versión vista', async () => {
    const sent = serveParties(SALES, {
      [`POST /v1/parties/${ORG_ID}/actions/change-status`]: () => noContent(),
    });
    renderDetail();
    await userEvent.click(await screen.findByRole('button', { name: 'Bloquear' }));
    const dialog = await screen.findByRole('dialog');
    await userEvent.type(within(dialog).getByLabelText('Motivo del bloqueo'), 'Lista restrictiva');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Bloquear' }));
    await vi.waitFor(() => {
      const request = sent.find((r) => r.path.endsWith('/change-status'));
      expect(request?.body).toEqual({ status: 'blocked', reason: 'Lista restrictiva' });
      expect(request?.headers['If-Match']).toBe('"2"');
    });
  });
});

describe('estados y papeles (2)', () => {
  it('inactiva con confirmación y agrega un papel', async () => {
    const sent = serveParties(SALES, {
      [`POST /v1/parties/${ORG_ID}/actions/change-status`]: () => noContent(),
      [`POST /v1/parties/${ORG_ID}/roles`]: () => noContent(),
    });
    renderDetail();
    await userEvent.click(await screen.findByRole('button', { name: 'Inactivar' }));
    await userEvent.click(await screen.findByRole('button', { name: 'Sí, inactivar' }));
    await userEvent.click(screen.getByRole('button', { name: 'Agregar el papel Proveedor' }));
    await vi.waitFor(() => {
      expect(sent.find((r) => r.path.endsWith('/change-status'))?.body).toEqual({
        status: 'inactive',
        reason: null,
      });
      expect(sent.find((r) => r.path.endsWith('/roles'))?.body).toEqual({ role: 'supplier' });
    });
  });
});

describe('fusión de duplicados', () => {
  it('compara los dos registros y fusiona el elegido', async () => {
    const sent = serveParties(SALES, {
      'GET /v1/parties/search': () =>
        json({ data: [{ party: DUPLICATE_SUMMARY, reasons: ['email', 'name'] }] }),
      [`POST /v1/parties/${ORG_ID}/merge`]: () => noContent(),
    });
    renderDetail();
    await userEvent.click(await screen.findByRole('button', { name: 'Fusionar un duplicado' }));
    const dialog = await screen.findByRole('dialog');
    await userEvent.click(await within(dialog).findByLabelText(/COMERCIALIZADORA ANDINA SAS/));
    expect(within(dialog).getByText('NIT 900555102-3')).toBeVisible();
    await userEvent.click(within(dialog).getByRole('button', { name: 'Fusionar' }));
    await userEvent.click(await screen.findByRole('button', { name: 'Sí, fusionar' }));
    await vi.waitFor(() => {
      expect(sent.find((r) => r.path.endsWith('/merge'))?.body).toEqual({
        duplicate_id: DUPLICATE_ID,
      });
    });
  });
});

describe('cuentas bancarias en la ficha', () => {
  it('quien puede verlas tiene la pestaña Cuentas bancarias', async () => {
    serveParties(FINANCE);
    renderDetail();
    expect(await screen.findByRole('tab', { name: 'Cuentas bancarias' })).toBeVisible();
  });
});

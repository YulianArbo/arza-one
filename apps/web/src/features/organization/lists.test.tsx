import { screen, within } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  CATALOG_DETAIL,
  CENTER_ID,
  COST_CENTERS,
  CORE_ADMIN,
  ITEM_CC,
  Screen,
  UNIT_TEC,
  serveCore,
} from '../../test-support/core-fixtures';
import { json, noContent, renderWithApi } from '../../test-support/fake-api';
import { CatalogsPanel } from './catalogs-panel';
import { CostCentersPanel } from './cost-centers-panel';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace: vi.fn(), push: vi.fn() }),
  usePathname: () => '/app/administracion',
}));

beforeEach(() => {
  vi.stubGlobal('scrollTo', vi.fn());
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('centros de costo', () => {
  it('crea un centro ligado a un proceso', async () => {
    const sent = serveCore(CORE_ADMIN, {
      'POST /v1/cost-centers': () => json({ id: CENTER_ID }, 201),
    });
    renderWithApi(
      <Screen>
        <CostCentersPanel />
      </Screen>,
    );
    expect(await screen.findByText('CC-010')).toBeVisible();
    await userEvent.click(screen.getByRole('button', { name: 'Agregar un centro de costo' }));
    const dialog = await screen.findByRole('dialog');
    await userEvent.type(within(dialog).getByLabelText('Código'), 'cc-020');
    await userEvent.type(within(dialog).getByLabelText('Nombre'), 'Ventas');
    await userEvent.selectOptions(
      within(dialog).getByLabelText('Proceso o área (opcional)'),
      UNIT_TEC,
    );
    await userEvent.click(within(dialog).getByRole('button', { name: 'Guardar' }));
    await vi.waitFor(() => {
      expect(sent.find((r) => r.method === 'POST')?.body).toEqual({
        code: 'CC-020',
        name: 'Ventas',
        org_unit_id: UNIT_TEC,
      });
    });
  });
});

describe('centros de costo (2)', () => {
  it('edita, inactiva y elimina un centro', async () => {
    const sent = serveCore(CORE_ADMIN, {
      [`PATCH /v1/cost-centers/${CENTER_ID}`]: () =>
        json({ ...COST_CENTERS.data[0], is_active: false }),
      [`DELETE /v1/cost-centers/${CENTER_ID}`]: () => noContent(),
    });
    renderWithApi(
      <Screen>
        <CostCentersPanel />
      </Screen>,
    );
    await userEvent.click(await screen.findByRole('button', { name: 'Editar Operación' }));
    const dialog = await screen.findByRole('dialog');
    await userEvent.click(within(dialog).getByLabelText('Activo'));
    await userEvent.click(within(dialog).getByRole('button', { name: 'Guardar' }));
    await vi.waitFor(() => {
      expect(sent.find((r) => r.method === 'PATCH')?.body).toMatchObject({ is_active: false });
    });
    await userEvent.click(screen.getByRole('button', { name: 'Eliminar' }));
    await userEvent.click(await screen.findByRole('button', { name: 'Sí, eliminar' }));
    await vi.waitFor(() => {
      expect(sent.some((r) => r.method === 'DELETE')).toBe(true);
    });
  });
});

describe('centros de costo (3)', () => {
  it('sin centros lo dice', async () => {
    serveCore(CORE_ADMIN, { 'GET /v1/cost-centers': () => json({ data: [] }) });
    renderWithApi(
      <Screen>
        <CostCentersPanel />
      </Screen>,
    );
    expect(await screen.findByText('Todavía no hay centros de costo')).toBeVisible();
  });
});

describe('catálogos', () => {
  it('muestra las opciones, agrega una y cambia de catálogo', async () => {
    const sent = serveCore(CORE_ADMIN, {
      'POST /v1/catalogs/identification_types/items': () => json({ id: ITEM_CC }, 201),
    });
    renderWithApi(
      <Screen>
        <CatalogsPanel />
      </Screen>,
    );
    expect(await screen.findByText('Cédula de ciudadanía')).toBeVisible();
    await userEvent.click(screen.getByRole('button', { name: 'Agregar una opción' }));
    const dialog = await screen.findByRole('dialog');
    await userEvent.type(within(dialog).getByLabelText('Código'), 'pep');
    await userEvent.type(within(dialog).getByLabelText('Texto que se muestra'), 'Permiso especial');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Guardar' }));
    await vi.waitFor(() => {
      expect(sent.find((r) => r.method === 'POST')?.body).toEqual({
        code: 'PEP',
        label: 'Permiso especial',
        sort_order: 0,
      });
    });
    await userEvent.selectOptions(screen.getByLabelText('Catálogo'), 'payment_terms');
    expect(await screen.findByRole('heading', { name: 'Plazos de pago' })).toBeVisible();
  });
});

describe('catálogos (2)', () => {
  it('edita una opción sin poder cambiar su código', async () => {
    const sent = serveCore(CORE_ADMIN, {
      [`PATCH /v1/catalogs/identification_types/items/${ITEM_CC}`]: () =>
        json({ ...CATALOG_DETAIL.items[0], sort_order: 5 }),
    });
    renderWithApi(
      <Screen>
        <CatalogsPanel />
      </Screen>,
    );
    await userEvent.click(
      await screen.findByRole('button', { name: 'Editar Cédula de ciudadanía' }),
    );
    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByLabelText('Código')).toBeDisabled();
    const order = within(dialog).getByLabelText('Orden');
    await userEvent.clear(order);
    await userEvent.type(order, '5');
    await userEvent.click(within(dialog).getByLabelText('Activa'));
    await userEvent.click(within(dialog).getByRole('button', { name: 'Guardar' }));
    await vi.waitFor(() => {
      expect(sent.find((r) => r.method === 'PATCH')?.body).toEqual({
        label: 'Cédula de ciudadanía',
        sort_order: 5,
        is_active: false,
      });
    });
  });
});

describe('catálogos (3)', () => {
  it('sin catálogos lo dice', async () => {
    serveCore(CORE_ADMIN, { 'GET /v1/catalogs': () => json({ data: [] }) });
    renderWithApi(
      <Screen>
        <CatalogsPanel />
      </Screen>,
    );
    expect(await screen.findByText('No hay catálogos')).toBeVisible();
  });
});

import { screen, within } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  CORE_ADMIN,
  CORE_READER,
  SITE_OTHER,
  SITES,
  Screen,
  TENANT,
  serveCore,
} from '../../test-support/core-fixtures';
import { apiError, json, noContent, renderWithApi } from '../../test-support/fake-api';
import { SitesPanel } from './sites-panel';
import { TenantForm } from './tenant-form';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace: vi.fn(), push: vi.fn() }),
  usePathname: () => '/app/administracion/empresa',
}));

beforeEach(() => {
  vi.stubGlobal('scrollTo', vi.fn());
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('datos legales de la empresa', () => {
  it('guarda la razón social con la versión vista', async () => {
    const sent = serveCore(CORE_ADMIN, {
      'PATCH /v1/tenant': () => json({ ...TENANT, version: 4 }),
    });
    renderWithApi(
      <Screen>
        <TenantForm />
      </Screen>,
    );
    const save = await screen.findByRole('button', { name: 'Guardar los datos' });
    const field = screen.getByLabelText('Razón social');
    await userEvent.clear(field);
    await userEvent.type(field, 'Empresa Nueva S.A.S.');
    await userEvent.clear(screen.getByLabelText('Nombre comercial (opcional)'));
    await userEvent.click(save);
    expect(await screen.findByText('Datos de la empresa guardados.')).toBeVisible();
    const patch = sent.find((request) => request.method === 'PATCH');
    expect(patch?.headers['If-Match']).toBe('"3"');
    expect(patch?.body).toEqual({
      legal_name: 'Empresa Nueva S.A.S.',
      trade_name: null,
      tax_id: '900123456-7',
    });
  });
});

describe('datos legales de la empresa (2)', () => {
  it('quien solo lee ve los datos sin poder cambiarlos', async () => {
    serveCore(CORE_READER);
    renderWithApi(
      <Screen>
        <TenantForm />
      </Screen>,
    );
    expect(await screen.findByLabelText('NIT')).toBeDisabled();
    expect(screen.queryByRole('button', { name: 'Guardar los datos' })).toBeNull();
  });
});

describe('sedes', () => {
  it('lista las sedes y agrega una nueva', async () => {
    const sent = serveCore(CORE_ADMIN, { 'POST /v1/sites': () => json({ id: SITE_OTHER }, 201) });
    renderWithApi(
      <Screen>
        <SitesPanel />
      </Screen>,
    );
    expect(await screen.findByText('Principal')).toBeVisible();
    await userEvent.click(screen.getByRole('button', { name: 'Agregar una sede' }));
    const dialog = await screen.findByRole('dialog');
    await userEvent.type(within(dialog).getByLabelText('Nombre'), 'Sede sur');
    await userEvent.type(within(dialog).getByLabelText('Ciudad'), 'Cali');
    await userEvent.type(within(dialog).getByLabelText('Dirección'), 'Avenida 6 # 20-30');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Guardar la sede' }));
    await vi.waitFor(() => {
      expect(screen.queryByRole('dialog')).toBeNull();
    });
    expect(sent.find((r) => r.method === 'POST')?.body).toEqual({
      name: 'Sede sur',
      city: 'Cali',
      address: 'Avenida 6 # 20-30',
      is_main: false,
    });
  });
});

describe('sedes: editar y eliminar', () => {
  it('edita una sede y marca que queda inactiva', async () => {
    const sent = serveCore(CORE_ADMIN, {
      [`PATCH /v1/sites/${SITE_OTHER}`]: () =>
        json({ ...SITES.data[1], is_active: false, version: 3 }),
    });
    renderWithApi(
      <Screen>
        <SitesPanel />
      </Screen>,
    );
    await userEvent.click(await screen.findByRole('button', { name: 'Editar Bodega' }));
    const dialog = await screen.findByRole('dialog');
    await userEvent.click(within(dialog).getByLabelText('Activa'));
    await userEvent.click(within(dialog).getByRole('button', { name: 'Guardar la sede' }));
    await vi.waitFor(() => {
      expect(sent.find((r) => r.method === 'PATCH')?.body).toMatchObject({ is_active: false });
    });
    expect(sent.find((r) => r.method === 'PATCH')?.headers['If-Match']).toBe('"2"');
  });
});

describe('sedes: editar y eliminar (2)', () => {
  it('pide confirmación para eliminar y muestra el error de la API', async () => {
    serveCore(CORE_ADMIN, {
      [`DELETE /v1/sites/${SITE_OTHER}`]: () =>
        apiError(409, 'VERSION_CONFLICT', 'Otra persona cambió este registro.'),
    });
    renderWithApi(
      <Screen>
        <SitesPanel />
      </Screen>,
    );
    await userEvent.click(await screen.findByRole('button', { name: 'Eliminar' }));
    await userEvent.click(await screen.findByRole('button', { name: 'Sí, eliminar' }));
    expect(await screen.findByText('Otra persona cambió este registro.')).toBeVisible();
  });
});

describe('sedes: editar y eliminar (3)', () => {
  it('sin sedes invita a crear la principal; eliminar responde sin contenido', async () => {
    serveCore(CORE_ADMIN, {
      'GET /v1/sites': () => json({ data: [] }),
      'DELETE /v1/sites/x': () => noContent(),
    });
    renderWithApi(
      <Screen>
        <SitesPanel />
      </Screen>,
    );
    expect(await screen.findByText('Todavía no hay sedes')).toBeVisible();
  });
});

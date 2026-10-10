import { screen, within } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  CORE_ADMIN,
  CORE_READER,
  POS_MANAGER,
  POSITIONS,
  Screen,
  UNIT_TEC,
  UNITS,
  serveCore,
} from '../../test-support/core-fixtures';
import { apiError, json, noContent, renderWithApi } from '../../test-support/fake-api';
import { buildChart } from './org-chart';
import { StructurePanel } from './structure-panel';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace: vi.fn(), push: vi.fn() }),
  usePathname: () => '/app/administracion/procesos-y-cargos',
}));

beforeEach(() => {
  vi.stubGlobal('scrollTo', vi.fn());
});

afterEach(() => {
  vi.unstubAllGlobals();
});

function renderStructure(): void {
  renderWithApi(
    <Screen>
      <StructurePanel />
    </Screen>,
  );
}

describe('organigrama', () => {
  it('cuelga cada cargo de su jefe y avisa que la estructura es provisional', async () => {
    serveCore(CORE_READER);
    renderStructure();
    const director = await screen.findByText('Director General', { selector: 'span' });
    const branch = director.closest('li');
    if (branch === null) throw new Error('Falta la rama del director');
    expect(within(branch).getByText('Gerente de Tecnología', { selector: 'span' })).toBeVisible();
    expect(screen.getByText(/es provisional/)).toBeVisible();
    expect(screen.queryByRole('button', { name: 'Agregar un cargo' })).toBeNull();
  });
});

describe('organigrama (2)', () => {
  it('un cargo cuyo jefe ya no está queda en la raíz', () => {
    const orphan = { ...POSITIONS.data[1], reports_to_id: 'no-existe' };
    const chart = buildChart([orphan], []);
    expect(chart.map((node) => node.position.name)).toEqual(['Gerente de Tecnología']);
  });
});

describe('procesos y áreas', () => {
  it('crea un proceso con el código en mayúsculas y el cargo líder elegido', async () => {
    const sent = serveCore(CORE_ADMIN, { 'POST /v1/org-units': () => json({ id: UNIT_TEC }, 201) });
    renderStructure();
    await userEvent.click(await screen.findByRole('button', { name: 'Agregar un proceso o área' }));
    const dialog = await screen.findByRole('dialog');
    await userEvent.type(within(dialog).getByLabelText('Código'), 'com');
    await userEvent.type(within(dialog).getByLabelText('Nombre'), 'Gestión Comercial');
    await userEvent.selectOptions(within(dialog).getByLabelText('Cargo líder'), 'Director General');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Guardar' }));
    await vi.waitFor(() => {
      expect(sent.find((r) => r.method === 'POST')?.body).toMatchObject({
        code: 'COM',
        kind: 'process',
        parent_id: null,
      });
    });
  });
});

describe('procesos y áreas (2)', () => {
  it('al editar puede inactivar; si no se puede eliminar, lo explica', async () => {
    const sent = serveCore(CORE_ADMIN, {
      [`PATCH /v1/org-units/${UNIT_TEC}`]: () => json({ ...UNITS.data[1], is_active: false }),
      [`DELETE /v1/org-units/${UNIT_TEC}`]: () =>
        apiError(
          409,
          'CORE_RECORD_IN_USE',
          'No se puede eliminar: tiene cargos. Inactívelo en su lugar.',
        ),
    });
    renderStructure();
    await userEvent.click(
      await screen.findByRole('button', { name: 'Editar Desarrollo y Tecnología' }),
    );
    const dialog = await screen.findByRole('dialog');
    await userEvent.selectOptions(within(dialog).getByLabelText('Tipo'), 'area');
    await userEvent.click(within(dialog).getByLabelText('Activo'));
    await userEvent.click(within(dialog).getByRole('button', { name: 'Guardar' }));
    await vi.waitFor(() => {
      expect(sent.find((r) => r.method === 'PATCH')?.body).toMatchObject({
        kind: 'area',
        is_active: false,
      });
    });
    const section = screen.getByRole('region', { name: 'Procesos y áreas' });
    await userEvent.click(
      within(section).getAllByRole('button', { name: 'Eliminar' })[1] ?? section,
    );
    await userEvent.click(await screen.findByRole('button', { name: 'Sí, eliminar' }));
    expect(await screen.findByText(/tiene cargos/)).toBeVisible();
  });
});

describe('cargos', () => {
  it('crea un cargo que reporta a otro', async () => {
    const sent = serveCore(CORE_ADMIN, {
      'POST /v1/positions': () => json({ id: POS_MANAGER }, 201),
    });
    renderStructure();
    await userEvent.click(await screen.findByRole('button', { name: 'Agregar un cargo' }));
    const dialog = await screen.findByRole('dialog');
    await userEvent.type(within(dialog).getByLabelText('Nombre del cargo'), 'Analista');
    await userEvent.selectOptions(within(dialog).getByLabelText('Proceso o área'), UNIT_TEC);
    await userEvent.selectOptions(within(dialog).getByLabelText('Reporta a'), 'Director General');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Guardar' }));
    await vi.waitFor(() => {
      expect(sent.find((r) => r.method === 'POST')?.body).toMatchObject({
        name: 'Analista',
        org_unit_id: UNIT_TEC,
      });
    });
  });
});

describe('cargos (2)', () => {
  it('edita, reactiva y elimina un cargo', async () => {
    const sent = serveCore(CORE_ADMIN, {
      [`PATCH /v1/positions/${POS_MANAGER}`]: () => json({ ...POSITIONS.data[1], is_active: true }),
      [`DELETE /v1/positions/${POS_MANAGER}`]: () => noContent(),
    });
    renderStructure();
    await userEvent.click(
      await screen.findByRole('button', { name: 'Editar Gerente de Tecnología' }),
    );
    const dialog = await screen.findByRole('dialog');
    await userEvent.click(within(dialog).getByLabelText('Activo'));
    await userEvent.click(within(dialog).getByRole('button', { name: 'Guardar' }));
    await vi.waitFor(() => {
      expect(sent.find((r) => r.method === 'PATCH')?.headers['If-Match']).toBe('"2"');
    });
    const section = screen.getByRole('region', { name: 'Cargos' });
    await userEvent.click(
      within(section).getAllByRole('button', { name: 'Eliminar' })[1] ?? section,
    );
    await userEvent.click(await screen.findByRole('button', { name: 'Sí, eliminar' }));
    await vi.waitFor(() => {
      expect(sent.some((r) => r.method === 'DELETE')).toBe(true);
    });
  });
});

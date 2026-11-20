import type { Announcement } from '@arza/contracts';
import { screen, within } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { Screen, serveCore } from '../../test-support/core-fixtures';
import { json, noContent, renderWithApi } from '../../test-support/fake-api';
import { permissionsOf } from '../../test-support/party-fixtures';
import { bogotaToday } from '../crm/labels';
import { AnnouncementsPanel } from './announcements-panel';

// Administración › Comunicados (B36A): la lista con su estado, crear, validar y terminar.

vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace: vi.fn(), push: vi.fn() }),
  usePathname: () => '/app/administracion/comunicados',
}));

beforeEach(() => {
  vi.stubGlobal('scrollTo', vi.fn());
});

afterEach(() => {
  vi.unstubAllGlobals();
});

const MANAGER = permissionsOf(['core.announcement.manage']);

function announcement(overrides: Partial<Announcement>): Announcement {
  return {
    id: '01999a00-0000-7000-8000-0000000aa001',
    title: 'Mantenimiento del sábado',
    body: 'La plataforma estará en mantenimiento de 6 a 8 a. m.',
    link_url: null,
    audience: 'both',
    starts_on: '2026-11-20',
    ends_on: '2026-11-30',
    image_file_id: null,
    status: 'active',
    ended_at: null,
    created_at: '2026-11-20T13:00:00.000Z',
    version: 2,
    ...overrides,
  };
}

const ACTIVE = announcement({});
const EXPIRED = announcement({
  id: '01999a00-0000-7000-8000-0000000aa002',
  title: 'Cierre de año',
  audience: 'clients',
  status: 'expired',
});

function show(extra = {}) {
  const sent = serveCore(MANAGER, {
    'GET /v1/announcements': () => json({ data: [ACTIVE, EXPIRED] }),
    ...extra,
  });
  renderWithApi(
    <Screen>
      <AnnouncementsPanel />
    </Screen>,
  );
  return sent;
}

describe('lista de comunicados', () => {
  it('muestra vigencia y estado; solo el vigente se edita o se termina', async () => {
    show();
    const active = (await screen.findByText('Mantenimiento del sábado')).closest('tr');
    expect(active).not.toBeNull();
    const row = within(active as HTMLElement);
    expect(row.getByText('Vigente')).toBeVisible();
    expect(row.getByText('20/11/2026 a 30/11/2026')).toBeVisible();
    expect(row.getByRole('button', { name: 'Editar Mantenimiento del sábado' })).toBeVisible();
    const expired = within(screen.getByText('Cierre de año').closest('tr') as HTMLElement);
    expect(expired.getByText('Vencido')).toBeVisible();
    expect(expired.getByText('Clientes')).toBeVisible();
    expect(expired.queryByRole('button')).toBeNull();
  });
});

describe('crear un comunicado', () => {
  it('valida los datos y envía el comunicado con su vigencia', async () => {
    const sent = show({ 'POST /v1/announcements': () => json({ id: ACTIVE.id }, 201) });
    await userEvent.click(await screen.findByRole('button', { name: 'Crear comunicado' }));
    const dialog = await screen.findByRole('dialog');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Guardar' }));
    expect(await within(dialog).findByRole('alert')).toHaveTextContent('Revise');
    await userEvent.type(within(dialog).getByLabelText('Título'), 'Bienvenida');
    await userEvent.type(within(dialog).getByLabelText('Texto'), 'Bienvenidos al portal.');
    await userEvent.selectOptions(within(dialog).getByLabelText('Para quién'), 'clients');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Guardar' }));
    await vi.waitFor(() => {
      expect(sent.find((request) => request.method === 'POST')?.body).toEqual({
        title: 'Bienvenida',
        body: 'Bienvenidos al portal.',
        audience: 'clients',
        starts_on: bogotaToday(),
        ends_on: bogotaToday(),
        link_url: null,
        image_file_id: null,
      });
    });
  });
});

describe('terminar un comunicado', () => {
  it('pide confirmar y lo termina con la versión vista', async () => {
    const sent = show({ [`POST /v1/announcements/${ACTIVE.id}/end`]: () => noContent() });
    const row = within(
      (await screen.findByText('Mantenimiento del sábado')).closest('tr') as HTMLElement,
    );
    await userEvent.click(row.getByRole('button', { name: 'Terminar' }));
    await userEvent.click(await screen.findByRole('button', { name: 'Sí, terminar' }));
    await vi.waitFor(() => {
      const end = sent.find((request) => request.path.endsWith('/end'));
      expect(end?.headers['If-Match']).toBe('"2"');
    });
  });
});

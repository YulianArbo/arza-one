import type { Announcement } from '@arza/contracts';
import { screen, waitFor, within } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { Screen, serveCore } from '../../test-support/core-fixtures';
import { apiError, json, noContent, renderWithApi } from '../../test-support/fake-api';
import { permissionsOf } from '../../test-support/party-fixtures';
import { AnnouncementsPanel } from './announcements-panel';

// Imagen del comunicado (B36A): se sube al elegirla y, al guardar, la web espera al antivirus.

vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace: vi.fn(), push: vi.fn() }),
  usePathname: () => '/app/administracion/comunicados',
}));

const ID = '01999a00-0000-7000-8000-0000000aa001';
const LINK = {
  id: '01999a00-0000-7000-8000-0000000b0001',
  upload_url: 'http://api.test/v1/files/uploads/llave',
  expires_at: '2026-11-20T15:15:00.000Z',
};
const WITH_IMAGE: Announcement = {
  id: ID,
  title: 'Nueva sede',
  body: 'Desde diciembre atendemos también en Pasto.',
  link_url: 'https://arza.example/sedes',
  audience: 'staff',
  starts_on: '2026-11-20',
  ends_on: '2026-12-20',
  image_file_id: '01999a00-0000-7000-8000-0000000b0009',
  status: 'active',
  ended_at: null,
  created_at: '2026-11-20T13:00:00.000Z',
  version: 1,
};

beforeEach(() => {
  vi.stubGlobal('scrollTo', vi.fn());
  vi.stubGlobal(
    'URL',
    Object.assign(URL, { createObjectURL: () => 'blob:comunicado', revokeObjectURL: vi.fn() }),
  );
});

afterEach(() => {
  vi.unstubAllGlobals();
});

/** La API de prueba: la primera vez que se guarda, la imagen sigue en el antivirus. */
function serveWithImage() {
  const state = { attempts: 0 };
  const sent = serveCore(permissionsOf(['core.announcement.manage']), {
    'GET /v1/announcements': () => json({ data: [WITH_IMAGE] }),
    [`GET /v1/announcements/${ID}/image`]: () => new Response('png', { status: 200 }),
    'POST /v1/announcements/uploads': () => json(LINK, 201),
    'PUT /v1/files/uploads/llave': () => noContent(),
    [`PATCH /v1/announcements/${ID}`]: () => {
      state.attempts += 1;
      return state.attempts === 1
        ? apiError(409, 'IMAGE_SCANNING', 'En revisión')
        : json({ ...WITH_IMAGE, image_file_id: LINK.id, version: 2 });
    },
  });
  return { sent, state };
}

describe('imagen del comunicado', () => {
  it('cambia la imagen y guarda cuando el antivirus termina de revisarla', async () => {
    const { sent, state } = serveWithImage();
    renderWithApi(
      <Screen>
        <AnnouncementsPanel />
      </Screen>,
    );
    await userEvent.click(await screen.findByRole('button', { name: 'Editar Nueva sede' }));
    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByRole('button', { name: 'Cambiar imagen' })).toBeVisible();
    const file = new File(['png'], 'Sede.png', { type: 'image/png' });
    await userEvent.upload(within(dialog).getByLabelText('Elegir la imagen del comunicado'), file);
    await waitFor(() => {
      expect(sent.some((request) => request.path === '/v1/files/uploads/llave')).toBe(true);
    });
    await userEvent.click(within(dialog).getByRole('button', { name: 'Guardar' }));
    await waitFor(
      () => {
        expect(state.attempts).toBe(2);
      },
      { timeout: 4000 },
    );
    const saved = sent.filter((request) => request.method === 'PATCH').at(-1);
    expect(saved?.body).toMatchObject({ image_file_id: LINK.id, audience: 'staff' });
  });
});

describe('imagen del comunicado: archivo que no sirve', () => {
  it('una imagen que no es PNG ni JPG no se sube', async () => {
    serveCore(permissionsOf(['core.announcement.manage']), {
      'GET /v1/announcements': () => json({ data: [] }),
    });
    renderWithApi(
      <Screen>
        <AnnouncementsPanel />
      </Screen>,
    );
    await userEvent.click(await screen.findByRole('button', { name: 'Crear comunicado' }));
    const dialog = await screen.findByRole('dialog');
    const gif = new File(['gif'], 'Animado.gif', { type: 'image/gif' });
    await userEvent.upload(within(dialog).getByLabelText('Elegir la imagen del comunicado'), gif, {
      applyAccept: false,
    });
    expect(await within(dialog).findByText('Use una imagen PNG o JPG.')).toBeVisible();
    expect(within(dialog).queryByRole('button', { name: 'Quitar imagen' })).toBeNull();
  });
});

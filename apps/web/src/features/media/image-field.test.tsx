import { screen, waitFor } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import type { JSX, ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  SESSION,
  apiError,
  json,
  mockApi,
  noContent,
  renderWithApi,
} from '../../test-support/fake-api';
import { RequireSession } from '../session/session-provider';
import { ImageField } from './image-field';

// Foto y logo (B22A): la imagen se sube, se espera al antivirus y se muestra; también se quita.

vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace: vi.fn(), push: vi.fn() }),
  usePathname: () => '/app/perfil',
}));

const TARGET = { uploads: '/v1/me/photo/uploads', image: '/v1/me/photo', refresh: [] };
const LINK = {
  id: '01999a00-0000-7000-8000-0000000b0001',
  upload_url: 'http://api.test/v1/files/uploads/llave',
  expires_at: '2026-10-24T15:15:00.000Z',
};

function Screen({ children }: { readonly children: ReactNode }): JSX.Element {
  return <RequireSession kind="internal">{children}</RequireSession>;
}

function png(): File {
  return new File(['png'], 'Foto.png', { type: 'image/png' });
}

beforeEach(() => {
  vi.stubGlobal(
    'URL',
    Object.assign(URL, { createObjectURL: () => 'blob:foto', revokeObjectURL: vi.fn() }),
  );
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('elegir la foto', () => {
  it('sube la imagen, espera al antivirus y la usa', async () => {
    let attempts = 0;
    const sent = mockApi({
      'GET /v1/auth/session': () => json(SESSION),
      'POST /v1/me/photo/uploads': () => json(LINK, 201),
      'PUT /v1/files/uploads/llave': () => noContent(),
      'PUT /v1/me/photo': () => {
        attempts += 1;
        return attempts === 1 ? apiError(409, 'IMAGE_SCANNING', 'En revisión') : noContent();
      },
    });
    renderWithApi(
      <Screen>
        <ImageField target={TARGET} name="Ana Pérez" hasImage={false} noun="foto" editable />
      </Screen>,
    );
    await userEvent.upload(await screen.findByLabelText('Elegir la foto'), png());
    await waitFor(
      () => {
        expect(attempts).toBe(2);
      },
      { timeout: 4000 },
    );
    expect(await screen.findByText('Foto guardada.')).toBeInTheDocument();
    const used = sent.filter((request) => request.path === '/v1/me/photo');
    expect(used.at(-1)?.body).toEqual({ file_id: LINK.id });
  });
});

describe('elegir una imagen que no sirve', () => {
  it('una imagen que no es PNG o JPG no se envía', async () => {
    const sent = mockApi({ 'GET /v1/auth/session': () => json(SESSION) });
    renderWithApi(
      <Screen>
        <ImageField target={TARGET} name="Ana Pérez" hasImage={false} noun="foto" editable />
      </Screen>,
    );
    const pdf = new File(['%PDF'], 'Informe.pdf', { type: 'application/pdf' });
    await userEvent.upload(await screen.findByLabelText('Elegir la foto'), pdf, {
      applyAccept: false,
    });
    expect(await screen.findByText('Use una imagen PNG o JPG.')).toBeInTheDocument();
    expect(sent.some((request) => request.method === 'POST')).toBe(false);
  });
});

describe('ver y quitar la foto', () => {
  it('muestra la imagen guardada y la quita', async () => {
    const sent = mockApi({
      'GET /v1/auth/session': () => json(SESSION),
      'GET /v1/me/photo': () => new Response('png', { headers: { 'Content-Type': 'image/png' } }),
      'DELETE /v1/me/photo': () => noContent(),
    });
    renderWithApi(
      <Screen>
        <ImageField target={TARGET} name="Ana Pérez" hasImage noun="foto" editable />
      </Screen>,
    );
    // Primero se ven las iniciales; la foto llega después.
    await waitFor(() => {
      expect(screen.getByRole('img', { name: 'Ana Pérez' })).toHaveAttribute('src', 'blob:foto');
    });
    await userEvent.click(screen.getByRole('button', { name: 'Quitar' }));
    await waitFor(() => {
      expect(sent.some((request) => request.method === 'DELETE')).toBe(true);
    });
  });

  it('sin permiso para cambiarla solo se ve', async () => {
    mockApi({ 'GET /v1/auth/session': () => json(SESSION) });
    renderWithApi(
      <Screen>
        <ImageField
          target={TARGET}
          name="Demo Uno S.A.S."
          hasImage={false}
          noun="logo"
          editable={false}
        />
      </Screen>,
    );
    expect(await screen.findByText(/Todavía no hay logo/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Elegir/ })).not.toBeInTheDocument();
  });
});

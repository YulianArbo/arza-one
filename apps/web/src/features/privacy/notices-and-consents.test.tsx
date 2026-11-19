import { screen, within } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import type { ReactNode } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { apiError, json, renderWithApi } from '../../test-support/fake-api';
import {
  CONSENT_ID,
  DRAFT_ID,
  OFFICER,
  Screen,
  consent,
  notice,
  privacyPermissions,
  servePrivacy,
} from '../../test-support/privacy-fixtures';
import { ConsentsPanel } from './consents-panel';
import { NoticesPanel } from './notices-panel';
import { PrivacyHome } from './privacy-home';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace: vi.fn(), push: vi.fn() }),
  usePathname: () => '/app/privacidad',
}));

afterEach(() => {
  vi.unstubAllGlobals();
});

function render(ui: ReactNode): void {
  renderWithApi(<Screen>{ui}</Screen>);
}

describe('avisos y versiones', () => {
  it('muestra la versión vigente y publica el borrador con su versión', async () => {
    const sent = servePrivacy(OFFICER, {
      [`POST /v1/notices/${DRAFT_ID}/actions/publish`]: () =>
        json(notice({ id: DRAFT_ID, version_number: 2, version: 2 })),
    });
    render(<NoticesPanel />);
    expect(
      await screen.findByText('Vigente: versión 1, «Autorización de clientes 2026».'),
    ).toBeVisible();
    expect(screen.getAllByText(/Sin versión publicada/).length).toBeGreaterThan(0);
    await userEvent.click(screen.getByRole('button', { name: 'Publicar' }));
    await userEvent.click(await screen.findByRole('button', { name: 'Sí, publicar' }));
    await vi.waitFor(() => {
      const publish = sent.find((request) => request.method === 'POST');
      expect(publish?.headers).toMatchObject({ 'If-Match': '"1"' });
    });
  });
});

describe('avisos y versiones: borrador', () => {
  it('pide un texto suficiente antes de guardar el borrador', async () => {
    const sent = servePrivacy(OFFICER, {
      [`PATCH /v1/notices/${DRAFT_ID}`]: () => apiError(409, 'VERSION_CONFLICT', 'Otra versión.'),
    });
    render(<NoticesPanel />);
    await userEvent.click(await screen.findByRole('button', { name: 'Editar borrador' }));
    const body = await screen.findByLabelText('Texto completo');
    await userEvent.clear(body);
    await userEvent.type(body, 'Muy corto');
    await userEvent.click(screen.getByRole('button', { name: 'Guardar borrador' }));
    expect(await screen.findByText('El texto debe tener al menos 50 caracteres.')).toBeVisible();
    expect(sent.some((request) => request.method === 'PATCH')).toBe(false);
  });
});

describe('autorizaciones', () => {
  it('muestra la evidencia y revoca con motivo', async () => {
    const sent = servePrivacy(OFFICER, {
      [`POST /v1/consents/${CONSENT_ID}/actions/revoke`]: () =>
        json(consent({ status: 'revoked', revoked_at: '2026-10-16T15:00:00.000Z' })),
    });
    render(<ConsentsPanel />);
    expect(await screen.findByRole('link', { name: 'Laura Gómez Ríos' })).toBeVisible();
    await userEvent.click(
      screen.getByRole('button', {
        name: 'Ver evidencia de la autorización de Laura Gómez Ríos',
      }),
    );
    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByText('203.0.113.7')).toBeVisible();
    expect(within(dialog).getByText('Ana Pérez')).toBeVisible();
    await userEvent.type(
      within(dialog).getByLabelText('Motivo de la revocatoria'),
      'Lo pidió el titular',
    );
    await userEvent.click(within(dialog).getByRole('button', { name: 'Revocar' }));
    await vi.waitFor(() => {
      expect(sent.find((request) => request.method === 'POST')?.body).toEqual({
        reason: 'Lo pidió el titular',
      });
    });
  });
});

describe('autorizaciones: solo lectura y filtros', () => {
  it('quien solo lee no ve la revocatoria y el filtro va a la API', async () => {
    const sent = servePrivacy(privacyPermissions(['privacy.consent.read']), {
      'GET /v1/consents': () => json({ data: [], next_cursor: null }),
    });
    render(<ConsentsPanel />);
    expect(await screen.findByText('No hay autorizaciones')).toBeVisible();
    await userEvent.selectOptions(screen.getByLabelText('Estado'), 'revoked');
    await vi.waitFor(() => {
      expect(sent.some((request) => request.search.includes('status=revoked'))).toBe(true);
    });
  });
});

describe('entrada de privacidad', () => {
  it('muestra solo las secciones permitidas', async () => {
    servePrivacy(privacyPermissions(['privacy.consent.read']));
    render(<PrivacyHome />);
    expect(await screen.findByRole('link', { name: /Autorizaciones/ })).toBeVisible();
    expect(screen.queryByRole('link', { name: /Encargados/ })).toBeNull();
  });
});

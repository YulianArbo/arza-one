import { screen } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import type { ReactNode } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { apiError, json, mockApi, renderWithApi } from '../../test-support/fake-api';
import { PortalScreen, CLIENT_ADMIN, servePortal } from '../../test-support/portal-fixtures';
import { PortalPrivacyRequests } from '../portal/portal-privacy-requests';
import { PublicPrivacyRequestForm } from './public-privacy-request';
import { PublicPrivacyStatusLookup } from './public-privacy-status';

// Derechos del titular en el sitio público y en el portal (B42, decisión 1). Datos ficticios.

vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace: vi.fn(), push: vi.fn(), back: vi.fn() }),
  usePathname: () => '/portal/mis-datos',
}));

afterEach(() => {
  vi.unstubAllGlobals();
});

const RECEIPT = {
  code: 'PRV-2026-0007',
  kind: 'claim',
  received_at: '2026-11-23T15:00:00.000Z',
  due_on: '2026-12-15',
};

describe('sitio público', () => {
  it('no envía sin la casilla y luego muestra el código y la fecha límite', async () => {
    const sent = mockApi({ 'POST /v1/public/privacy-requests': () => json(RECEIPT, 201) });
    renderWithApi(<PublicPrivacyRequestForm />);
    await userEvent.selectOptions(screen.getByLabelText('Qué quiere hacer'), 'erase');
    await userEvent.type(screen.getByLabelText('Nombre completo'), 'Titular Ficticio');
    await userEvent.type(screen.getByLabelText('Número de documento'), '1000000001');
    await userEvent.type(screen.getByLabelText('Correo'), 'titular@ejemplo.test');
    await userEvent.type(
      screen.getByLabelText('Cuéntenos qué necesita'),
      'Quiero que borren mis datos.',
    );
    await userEvent.click(screen.getByRole('button', { name: 'Enviar la solicitud' }));
    expect(sent).toHaveLength(0);
    await userEvent.click(screen.getByRole('checkbox'));
    await userEvent.click(screen.getByRole('button', { name: 'Enviar la solicitud' }));
    expect(await screen.findByText('PRV-2026-0007')).toBeInTheDocument();
    expect(sent[0]?.body).toMatchObject({ right: 'erase', accepts_privacy: true, website: '' });
  });
});

describe('sitio público', () => {
  it('la consulta muestra lo que falta para seguir', async () => {
    mockApi({
      'POST /v1/public/privacy-requests/status': () =>
        json({
          code: 'PRV-2026-0007',
          right: 'rectify',
          kind: 'claim',
          status: 'received',
          received_at: '2026-11-23T15:00:00.000Z',
          due_on: null,
          requirement: 'Envíe la copia de su cédula.',
          responded_at: null,
          response: null,
        }),
    });
    renderWithApi(<PublicPrivacyStatusLookup />);
    await userEvent.type(screen.getByLabelText('Código (PRV-…)'), 'prv-2026-0007');
    await userEvent.type(
      screen.getByLabelText('Correo con que la presentó'),
      'titular@ejemplo.test',
    );
    await userEvent.click(screen.getByRole('button', { name: 'Consultar' }));
    expect(await screen.findByText('Envíe la copia de su cédula.')).toBeInTheDocument();
  });
});

describe('sitio público', () => {
  it('si el código y el correo no coinciden lo dice', async () => {
    mockApi({
      'POST /v1/public/privacy-requests/status': () =>
        apiError(404, 'PRIVACY_REQUEST_NOT_FOUND', 'La solicitud no existe.'),
    });
    renderWithApi(<PublicPrivacyStatusLookup />);
    await userEvent.type(screen.getByLabelText('Código (PRV-…)'), 'PRV-2026-0099');
    await userEvent.type(screen.getByLabelText('Correo con que la presentó'), 'otra@ejemplo.test');
    await userEvent.click(screen.getByRole('button', { name: 'Consultar' }));
    expect(await screen.findByText('La solicitud no existe.')).toBeInTheDocument();
  });
});

function show(ui: ReactNode): void {
  renderWithApi(<PortalScreen>{ui}</PortalScreen>);
}

describe('portal', () => {
  it('el cliente presenta su solicitud y ve la constancia', async () => {
    const sent = servePortal(CLIENT_ADMIN, {
      'POST /v1/portal/me/privacy-requests': () => json(RECEIPT, 201),
    });
    show(<PortalPrivacyRequests />);
    expect(await screen.findByText('Todavía no ha presentado solicitudes.')).toBeInTheDocument();
    await userEvent.type(screen.getByLabelText('Su número de documento'), '1000000001');
    await userEvent.type(
      screen.getByLabelText('Cuéntenos qué necesita'),
      'Quiero saber qué datos tienen.',
    );
    await userEvent.click(screen.getByRole('button', { name: 'Enviar la solicitud' }));
    expect(await screen.findByText(/Recibimos su solicitud PRV-2026-0007/u)).toBeInTheDocument();
    expect(sent.find((request) => request.method === 'POST')?.body).toMatchObject({
      right: 'know',
    });
  });
});

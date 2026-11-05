import { screen } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { apiError, json, mockApi, noContent, renderWithApi } from '../../test-support/fake-api';
import { publicSignature } from '../../test-support/signature-fixtures';
import { ClientSignature } from './client-signature';

// La página de firma (B25, numeral 19.2): quien firma por el cliente abre el enlace, pide el código
// al correo, lo valida, lee el documento y firma con la casilla de aceptación expresa.

const TOKEN = 'F'.repeat(43);
const TICKET = 'T'.repeat(43);

beforeEach(() => {
  vi.stubGlobal('scrollTo', vi.fn());
  URL.createObjectURL = vi.fn(() => 'blob:documento');
  URL.revokeObjectURL = vi.fn();
  window.history.replaceState(null, '', `/firmar#token=${TOKEN}`);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

function pdf(): Response {
  return new Response(new Blob(['%PDF-1.7'], { type: 'application/pdf' }), {
    status: 200,
    headers: { 'content-type': 'application/pdf' },
  });
}

function serve(view: object = publicSignature(), extra = {}) {
  return mockApi({
    'POST /v1/public/signatures/open': () => json(view),
    'POST /v1/public/signatures/code': () => noContent(),
    'POST /v1/public/signatures/verify-code': () =>
      json({ ticket: TICKET, expires_at: '2026-10-30T16:00:00.000Z' }),
    'POST /v1/public/signatures/document': () => pdf(),
    'POST /v1/public/signatures/sign': () => noContent(),
    'POST /v1/public/signatures/reject': () => noContent(),
    ...extra,
  });
}

async function validateCode(): Promise<void> {
  await userEvent.click(await screen.findByRole('button', { name: 'Enviarme el código' }));
  expect(await screen.findByText(/Revise su correo/u)).toBeVisible();
  await userEvent.type(screen.getByLabelText('Código del correo'), '12ab3456');
  await userEvent.click(screen.getByRole('button', { name: 'Validar el código' }));
}

describe('la página de firma', () => {
  it('muestra el documento y quien firma; la llave va en el cuerpo, no en la dirección', async () => {
    const sent = serve();
    renderWithApi(<ClientSignature />);
    expect(await screen.findByRole('heading', { name: 'Contrato CTR-2026-0001' })).toBeVisible();
    expect(window.location.hash).toBe('');
    expect(sent[0]?.body).toEqual({ token: TOKEN });
    expect(screen.getByText('Laura Gómez')).toBeVisible();
    expect(screen.getByText(/la\*\*\*@cliente\.test/u)).toBeVisible();
  });

  it('con el código validado, lee el documento y firma con la casilla', async () => {
    const sent = serve();
    renderWithApi(<ClientSignature />);
    await validateCode();
    const verify = sent.find((request) => request.path.endsWith('/verify-code'));
    expect(verify?.body).toEqual({ token: TOKEN, code: '123456' });
    expect(await screen.findByTitle('Contrato CTR-2026-0001')).toBeVisible();
    await userEvent.click(screen.getByRole('button', { name: 'Firmar el documento' }));
    expect(await screen.findByText('Marque la casilla para firmar.')).toBeVisible();
    await userEvent.click(screen.getByLabelText(/He leído y acepto/u));
    await userEvent.click(screen.getByRole('button', { name: 'Firmar el documento' }));
    await vi.waitFor(() => {
      const sign = sent.find((request) => request.path.endsWith('/sign'));
      expect(sign?.body).toEqual({ token: TOKEN, ticket: TICKET, accept: true });
    });
  });
});

describe('la página de firma: rechazo y errores', () => {
  it('rechazar exige el motivo', async () => {
    const sent = serve();
    renderWithApi(<ClientSignature />);
    await validateCode();
    await userEvent.click(await screen.findByRole('button', { name: /rechazar/u }));
    await userEvent.click(screen.getByRole('button', { name: 'Confirmar el rechazo' }));
    expect(await screen.findByText('Escriba por qué lo rechaza.')).toBeVisible();
    await userEvent.type(
      screen.getByLabelText('¿Por qué lo rechaza?'),
      'El valor no es el acordado',
    );
    await userEvent.click(screen.getByRole('button', { name: 'Confirmar el rechazo' }));
    await vi.waitFor(() => {
      const reject = sent.find((request) => request.path.endsWith('/reject'));
      expect(reject?.body).toMatchObject({ reason: 'El valor no es el acordado' });
    });
  });

  it('un código equivocado dice cuántos intentos quedan', async () => {
    serve(publicSignature(), {
      'POST /v1/public/signatures/verify-code': () =>
        apiError(422, 'SIGNATURE_CODE_INVALID', 'El código no es correcto. Le quedan 4 intentos.'),
    });
    renderWithApi(<ClientSignature />);
    await validateCode();
    expect(await screen.findByText(/Le quedan 4 intentos/u)).toBeVisible();
  });
});

describe('la página de firma: estados', () => {
  it('quien no tiene el turno espera; un enlace bloqueado lo dice', async () => {
    serve(publicSignature({ state: 'waiting' }));
    const { unmount } = renderWithApi(<ClientSignature />);
    expect(await screen.findByText(/todavía no es su turno/u)).toBeVisible();
    expect(screen.queryByRole('button', { name: 'Enviarme el código' })).toBeNull();
    unmount();
    window.history.replaceState(null, '', `/firmar#token=${TOKEN}`);
    serve(publicSignature({ code_locked: true }));
    renderWithApi(<ClientSignature />);
    expect(await screen.findByText(/se bloqueó después de cinco códigos/u)).toBeVisible();
  });

  it('firmado por todos: descarga su copia', async () => {
    const sent = serve(publicSignature({ state: 'completed', signed_copy: true }));
    renderWithApi(<ClientSignature />);
    await userEvent.click(
      await screen.findByRole('button', { name: 'Descargar el documento firmado' }),
    );
    await vi.waitFor(() => {
      const copy = sent.find((request) => request.path.endsWith('/document'));
      expect(copy?.body).toEqual({ token: TOKEN, document: 'signed', disposition: 'attachment' });
    });
  });
});

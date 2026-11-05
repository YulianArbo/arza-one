import { screen } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { json, mockApi, renderWithApi } from '../../test-support/fake-api';
import { VerifyDocument, fileSha256, verifyProblem } from './verify-document';

// La verificación pública (B25, numeral 19.3): con el código o con el archivo, cuya huella se calcula
// en el navegador; el archivo nunca se envía.

const FOUND = {
  result: 'valid',
  document: {
    code: 'CTR-2026-0001',
    company: 'ARZA TECH S.A.S.',
    completed_at: '2026-10-30T17:00:00.000Z',
    signatures: 2,
    verification_code: 'ABCD-EFGH-JKLM',
  },
};

beforeEach(() => {
  vi.stubGlobal('scrollTo', vi.fn());
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('verificación pública', () => {
  it('con el código dice si es el original, sin mostrar nombres', async () => {
    const sent = mockApi({ 'POST /v1/public/verifications': () => json(FOUND) });
    renderWithApi(<VerifyDocument />);
    await userEvent.type(screen.getByLabelText('Código de verificación'), 'abcd-efgh-jklm');
    await userEvent.click(screen.getByRole('button', { name: 'Verificar' }));
    expect(await screen.findByText(/es auténtico/u)).toBeVisible();
    expect(screen.getByText(/firmado por 2 personas/u)).toBeVisible();
    expect(sent[0]?.body).toEqual({ code: 'ABCD-EFGH-JKLM' });
  });

  it('un archivo que no coincide lo dice; el archivo no viaja, solo su huella', async () => {
    const sent = mockApi({
      'POST /v1/public/verifications': () => json({ result: 'not_found', document: null }),
    });
    renderWithApi(<VerifyDocument />);
    const file = new File(['%PDF-1.7 alterado'], 'contrato.pdf', { type: 'application/pdf' });
    await userEvent.upload(screen.getByLabelText('Archivo PDF (opcional)'), file);
    await userEvent.click(screen.getByRole('button', { name: 'Verificar' }));
    expect(await screen.findByText(/No encontramos un documento firmado/u)).toBeVisible();
    expect(sent[0]?.body).toEqual({ sha256: await fileSha256(file) });
  });
});

describe('verificación pública: reglas', () => {
  it('pide el código o el archivo, con la forma correcta', () => {
    expect(verifyProblem('', null)).toBe('Escriba el código o cargue el archivo.');
    expect(verifyProblem('ABC', null)).toBe('El código tiene la forma XXXX-XXXX-XXXX.');
    expect(verifyProblem('ABCD-EFGH-JKLM', null)).toBeNull();
  });

  it('la huella del archivo es la SHA-256 de su contenido', async () => {
    const hash = await fileSha256(new Blob(['abc']));
    expect(hash).toBe('ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
  });
});

import { screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { SESSION, json, mockApi, renderWithApi } from '../../test-support/fake-api';
import { permissionsOf } from '../../test-support/party-fixtures';
import { DocumentsAlso } from './documents-also';

function serve(codes: Parameters<typeof permissionsOf>[0]): void {
  mockApi({
    'GET /v1/auth/session': () => json(SESSION),
    'GET /v1/me/permissions': () => json(permissionsOf(codes)),
  });
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('«También en Documentos» (B22B)', () => {
  it('quien lee documentos ve registros, formatos y solicitudes, no la retención', async () => {
    serve(['doc.document.read']);
    renderWithApi(<DocumentsAlso />);
    const also = await screen.findByRole('region', { name: 'También en Documentos' });
    expect(
      within(also)
        .getAllByRole('link')
        .map((link) => link.textContent),
    ).toEqual(['Registros', 'Formatos', 'Solicitudes']);
    expect(within(also).queryByRole('link', { name: 'Listado maestro' })).toBeNull();
  });

  it('la retención y la disposición aparecen solo con su permiso', async () => {
    serve(['doc.document.read', 'doc.retention.manage', 'doc.disposition.approve']);
    renderWithApi(<DocumentsAlso />);
    const also = await screen.findByRole('region', { name: 'También en Documentos' });
    expect(within(also).getByRole('link', { name: 'Retención' })).toHaveAttribute(
      'href',
      '/app/documentos/retencion',
    );
    expect(within(also).getByRole('link', { name: 'Disposición' })).toBeVisible();
  });
});

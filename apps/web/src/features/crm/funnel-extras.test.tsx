import { screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { SESSION, json, mockApi, renderWithApi } from '../../test-support/fake-api';
import { permissionsOf } from '../../test-support/party-fixtures';
import { CommercialAlso, QuotesAction } from './funnel-extras';

function serve(codes: Parameters<typeof permissionsOf>[0]): void {
  mockApi({
    'GET /v1/auth/session': () => json(SESSION),
    'GET /v1/me/permissions': () => json(permissionsOf(codes)),
  });
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('embudo en la nueva jerarquía (B22B)', () => {
  it('ofrece las cotizaciones y las demás funciones que la persona puede abrir', async () => {
    serve(['crm.opportunity.read', 'crm.quote.read', 'crm.lead.read']);
    renderWithApi(
      <>
        <QuotesAction />
        <CommercialAlso />
      </>,
    );
    const also = await screen.findByRole('region', { name: 'También en Comercial' });
    expect(screen.getAllByRole('link', { name: /Cotizaciones/u })).toHaveLength(1);
    expect(within(also).getByRole('link', { name: 'Prospectos' })).toBeVisible();
    expect(within(also).getByRole('link', { name: 'Portafolio' })).toBeVisible();
    expect(within(also).queryByRole('link', { name: 'Embudo' })).toBeNull();
    expect(within(also).queryByRole('link', { name: 'Informe' })).toBeNull();
  });

  it('sin permiso de cotizaciones no ofrece la acción', async () => {
    serve(['crm.opportunity.read', 'crm.lead.read']);
    renderWithApi(
      <>
        <QuotesAction />
        <CommercialAlso />
      </>,
    );
    expect(await screen.findByRole('region', { name: 'También en Comercial' })).toBeVisible();
    expect(screen.queryByRole('link', { name: 'Cotizaciones' })).toBeNull();
  });
});

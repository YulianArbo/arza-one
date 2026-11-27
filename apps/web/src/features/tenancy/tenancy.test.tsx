import type { PlatformTenant, TenantBranding, TenantExport } from '@arza/contracts';
import { screen, within } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { json, noContent } from '../../test-support/fake-api';
import { serve } from '../assistant/assistant-fixtures';
import { openDialog, sentTo, show } from '../sst/sst-test-support';
import { BrandingPanel, colorProblem } from './branding-panel';
import { CompanyBrand } from './company-brand';
import { PlatformTenants } from './platform-tenants';
import { TenantExportsPanel } from './tenant-exports-panel';

// Multiempresa (B48): la lista del operador con sus acciones, la marca propia y la exportación
// completa para la Dirección.

vi.mock('next/navigation', () => ({
  usePathname: () => '/app/administracion/empresas',
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
}));

beforeEach(() => {
  vi.stubGlobal('scrollTo', vi.fn());
});
afterEach(() => vi.unstubAllGlobals());

const ID = (n: number): string => `01900000-0000-7000-8000-${String(n).padStart(12, '0')}`;

function tenant(overrides: Partial<PlatformTenant> = {}): PlatformTenant {
  return {
    id: ID(1),
    legal_name: 'Cliente Uno S.A.S.',
    trade_name: null,
    tax_id: '900123456-8',
    status: 'active',
    is_operator: false,
    plan: 'basic',
    limits: { max_internal_users: 10, max_portal_users: 20, storage_mb: 5120, ai_assistant: false },
    usage: { internal_users: 4, portal_users: 2, storage_mb: 300 },
    suspended_at: null,
    suspension_reason: null,
    deletion_due_on: null,
    closed_at: null,
    last_export_at: null,
    created_at: '2026-11-27T15:00:00.000Z',
    version: 3,
    ...overrides,
  };
}

const OPERATOR = tenant({
  id: ID(2),
  legal_name: 'ARZA TECH S.A.S.',
  is_operator: true,
  plan: 'enterprise',
  limits: {
    max_internal_users: null,
    max_portal_users: null,
    storage_mb: 512000,
    ai_assistant: true,
  },
});

const PLATFORM = [
  'platform.tenant.read',
  'platform.tenant.manage',
  'platform.tenant.delete',
] as const;

describe('empresas de la plataforma', () => {
  it('muestra la ficha, el uso y el estado; la operadora no se suspende', async () => {
    serve({ 'GET /v1/platform/tenants': () => json({ data: [OPERATOR, tenant()] }) }, PLATFORM);
    show(<PlatformTenants />);
    const row = (await screen.findByText('Cliente Uno S.A.S.')).closest('tr');
    expect(row).not.toBeNull();
    const cells = within(row as HTMLElement);
    expect(cells.getByText('Internos: 4 de 10')).toBeInTheDocument();
    expect(cells.getByText('Archivos: 300 MB de 5 GB')).toBeInTheDocument();
    expect(cells.getByRole('button', { name: 'Suspender' })).toBeInTheDocument();
    const operatorRow = screen.getByText('ARZA TECH S.A.S.').closest('tr') as HTMLElement;
    expect(within(operatorRow).queryByRole('button', { name: 'Suspender' })).toBeNull();
    expect(within(operatorRow).getByText(/Opera la plataforma/)).toBeInTheDocument();
  });
});

describe('empresas de la plataforma', () => {
  it('suspende con el motivo y la versión que vio', async () => {
    const sent = serve(
      {
        'GET /v1/platform/tenants': () => json({ data: [tenant()] }),
        [`POST /v1/platform/tenants/${ID(1)}/suspend`]: () => noContent(),
      },
      PLATFORM,
    );
    show(<PlatformTenants />);
    const dialog = await openDialog('Suspender');
    await userEvent.type(
      within(dialog).getByLabelText('Motivo'),
      'Contrato terminado por falta de pago.',
    );
    await userEvent.click(within(dialog).getByRole('button', { name: 'Suspender la empresa' }));
    const request = sentTo(sent, '/suspend');
    expect(request?.body).toEqual({ reason: 'Contrato terminado por falta de pago.' });
    expect(request?.headers['If-Match']).toBe('"3"');
  });
});

describe('empresas de la plataforma', () => {
  it('pedir la eliminación exige escribir el NIT y avisa si no hay exportación', async () => {
    const suspended = tenant({ status: 'suspended', suspension_reason: 'Terminó el contrato.' });
    const sent = serve(
      {
        'GET /v1/platform/tenants': () => json({ data: [suspended] }),
        [`POST /v1/platform/tenants/${ID(1)}/deletion`]: () =>
          json({ deletion_due_on: '2026-12-27' }, 201),
      },
      PLATFORM,
    );
    show(<PlatformTenants />);
    const dialog = await openDialog('Pedir eliminación');
    expect(within(dialog).getByText(/no tiene exportación/)).toBeInTheDocument();
    await userEvent.type(
      within(dialog).getByLabelText('Motivo'),
      'La empresa pidió cerrar su cuenta.',
    );
    await userEvent.type(
      within(dialog).getByLabelText('Escriba el NIT 900123456-8 para confirmar'),
      '900123456-8',
    );
    await userEvent.click(within(dialog).getByRole('button', { name: 'Pedir la eliminación' }));
    expect(sentTo(sent, '/deletion')?.body).toEqual({
      reason: 'La empresa pidió cerrar su cuenta.',
      confirm_tax_id: '900123456-8',
    });
  });
});

describe('empresas de la plataforma', () => {
  it('sin permiso de gestión no ofrece crear empresas', async () => {
    serve({ 'GET /v1/platform/tenants': () => json({ data: [tenant()] }) }, [
      'platform.tenant.read',
    ]);
    show(<PlatformTenants />);
    await screen.findByText('Cliente Uno S.A.S.');
    expect(screen.queryByRole('button', { name: 'Nueva empresa' })).toBeNull();
  });
});

const BRAND: TenantBranding = {
  display_name: 'Marca Propia',
  primary_color: '#1F4E79',
  has_logo: false,
  version: 2,
};

describe('marca de la empresa', () => {
  it('el color debe leerse sobre blanco', () => {
    expect(colorProblem('#FFEE88')).toMatch(/no se lee bien/);
    expect(colorProblem('azul')).toMatch(/#RRGGBB/);
    expect(colorProblem('#1F4E79')).toBeNull();
    expect(colorProblem('')).toBeNull();
  });
});

describe('marca de la empresa', () => {
  it('guarda el nombre y el color con la versión que vio', async () => {
    const sent = serve(
      {
        'GET /v1/me/branding': () => json(BRAND),
        'PUT /v1/tenant/branding': () => json({ ...BRAND, display_name: 'Otra', version: 3 }),
      },
      ['core.tenant.read', 'core.tenant.update'],
    );
    show(<BrandingPanel />);
    const name = await screen.findByLabelText('Nombre para mostrar');
    await userEvent.clear(name);
    await userEvent.type(name, 'Otra');
    await userEvent.click(screen.getByRole('button', { name: 'Guardar la marca' }));
    expect(sentTo(sent, '/v1/tenant/branding')?.body).toEqual({
      display_name: 'Otra',
      primary_color: '#1F4E79',
    });
  });
});

describe('marca de la empresa', () => {
  it('sin permiso de cambiarla solo la muestra', async () => {
    serve({ 'GET /v1/me/branding': () => json(BRAND) }, ['core.tenant.read']);
    show(<BrandingPanel />);
    expect(await screen.findByLabelText('Nombre para mostrar')).toBeDisabled();
    expect(screen.queryByRole('button', { name: 'Guardar la marca' })).toBeNull();
  });
});

describe('marca de la empresa', () => {
  it('la barra superior muestra el nombre y la línea del color', async () => {
    serve({ 'GET /v1/me/branding': () => json(BRAND) }, []);
    show(<CompanyBrand />);
    expect(await screen.findByText('Marca Propia')).toBeInTheDocument();
    expect(screen.getByTestId('color-de-marca')).toHaveStyle({ backgroundColor: '#1F4E79' });
  });
});

function exportRow(overrides: Partial<TenantExport> = {}): TenantExport {
  return {
    id: ID(30),
    status: 'ready',
    requested_at: '2026-11-27T15:00:00.000Z',
    ready_at: '2026-11-27T15:05:00.000Z',
    expires_at: '2026-12-04T15:05:00.000Z',
    size_bytes: 3 * 1024 * 1024,
    tables: 191,
    rows: 1250,
    files: 12,
    manifest_sha256: 'a'.repeat(64),
    ...overrides,
  };
}

describe('exportación completa', () => {
  it('lista las exportaciones y pide una nueva', async () => {
    const sent = serve(
      {
        'GET /v1/tenant/exports': () => json({ data: [exportRow()] }),
        'POST /v1/tenant/exports': () => json({ id: ID(31) }, 201),
      },
      ['core.tenant.export'],
    );
    show(<TenantExportsPanel />);
    expect(await screen.findByText('191 tablas, 1.250 filas, 12 archivos')).toBeInTheDocument();
    expect(screen.getByText('Lista para descargar')).toBeInTheDocument();
    expect(screen.getByText('04/12/2026')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Generar exportación' }));
    expect(sentTo(sent, '/v1/tenant/exports')).toBeDefined();
  });
});

describe('exportación completa', () => {
  it('mientras una se genera no deja pedir otra', async () => {
    serve(
      {
        'GET /v1/tenant/exports': () =>
          json({
            data: [
              exportRow({
                status: 'running',
                rows: null,
                size_bytes: null,
                ready_at: null,
                expires_at: null,
                manifest_sha256: null,
              }),
            ],
          }),
      },
      ['core.tenant.export'],
    );
    show(<TenantExportsPanel />);
    expect(
      await screen.findByRole('button', { name: 'Hay una exportación en curso' }),
    ).toBeDisabled();
    expect(screen.queryByRole('button', { name: /Descargar/ })).toBeNull();
  });
});

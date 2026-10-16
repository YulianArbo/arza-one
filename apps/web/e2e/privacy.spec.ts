import { mockApi, mockPermissions, type ApiRoutes } from './support/api-mock';
import { accessibilityViolations, expect, test, useTheme } from './support/fixtures';

// Pantallas de privacidad de B17: accesibilidad WCAG 2.2 AA en modo claro y oscuro de la entrada,
// los avisos y versiones, las autorizaciones, las actividades de tratamiento y los encargados.

const ID = '01999a00-0000-7000-8000-00000000d001';
const PERSON = '01999a00-0000-7000-8000-00000000d402';

const NOTICE = {
  id: ID,
  key: 'authorization_customer',
  label: 'Autorización de clientes',
  version_number: 1,
  title: 'Autorización de clientes 2026',
  body: 'Texto ficticio de la autorización de clientes para las pruebas en el navegador.',
  purposes: ['COMMERCIAL'],
  status: 'published',
  effective_from: '2026-10-01T13:00:00.000Z',
  created_at: '2026-09-30T13:00:00.000Z',
  version: 2,
};

const CONSENT = {
  id: ID,
  party: { id: PERSON, name: 'Laura Gómez Ríos' },
  notice: { id: ID, key: NOTICE.key, label: NOTICE.label, version_number: 1, title: NOTICE.title },
  purposes: ['COMMERCIAL'],
  channel: 'written',
  granted_on: '2026-10-01',
  status: 'active',
  revoked_at: null,
  source: 'party_create',
  evidence: {
    recorded_by: 'Ana Pérez',
    recorded_at: '2026-10-01T15:00:00.000Z',
    ip_address: '203.0.113.7',
    user_agent: 'Navegador de prueba',
    file_id: null,
  },
  revocation_reason: null,
};

const PRIVACY_API: ApiRoutes = {
  '/v1/notices': { body: { data: [NOTICE] } },
  '/v1/consents': { body: { data: [CONSENT], next_cursor: null } },
  '/v1/processing-activities': {
    body: {
      data: [
        {
          id: ID,
          name: 'Gestión de clientes',
          purpose: 'Atender la relación comercial con los clientes',
          data_categories: ['identification', 'health'],
          holder_types: ['customers'],
          legal_basis: 'Autorización del titular',
          retention: 'Diez años',
          international_transfers: null,
          processors: [],
          sensitive: true,
          status: 'active',
          version: 1,
        },
      ],
    },
  },
  '/v1/processors': {
    body: {
      data: [
        {
          id: ID,
          party: { id: PERSON, name: 'Nube Andina S.A.S.' },
          service: 'Alojamiento en la nube',
          country: 'US',
          contract_file_id: null,
          has_contract: false,
          review_on: '2027-01-31',
          status: 'active',
          version: 1,
        },
      ],
    },
  },
  '/v1/catalogs/personal_data_purposes': {
    body: {
      key: 'personal_data_purposes',
      name: 'Finalidades',
      description: null,
      item_count: 1,
      items: [
        {
          id: ID,
          code: 'COMMERCIAL',
          label: 'Comercial',
          sort_order: 0,
          is_active: true,
          version: 1,
        },
      ],
    },
  },
};

const PAGES = [
  { path: '/app/privacidad', ready: 'Actividades de tratamiento' },
  { path: '/app/privacidad/avisos', ready: 'Vigente: versión 1' },
  { path: '/app/privacidad/autorizaciones', ready: 'Laura Gómez Ríos' },
  { path: '/app/privacidad/actividades', ready: 'Datos sensibles' },
  { path: '/app/privacidad/encargados', ready: 'Falta contrato de transmisión' },
];

for (const theme of ['light', 'dark'] as const) {
  test.describe(`privacidad en modo ${theme === 'light' ? 'claro' : 'oscuro'}`, () => {
    test.slow();
    for (const { path, ready } of PAGES) {
      test(`${path} no tiene violaciones de accesibilidad`, async ({ page, consoleErrors }) => {
        await useTheme(page, theme);
        await mockApi(page, PRIVACY_API);
        await page.goto(path);
        await expect(page.getByText(ready).first()).toBeVisible();
        expect(await accessibilityViolations(page)).toEqual([]);
        expect(consoleErrors).toEqual([]);
      });
    }
  });
}

test.describe('quien no maneja la privacidad', () => {
  test('ve «Sin permiso» si escribe la dirección', async ({ page }) => {
    await mockPermissions(page, { roles: [], permissions: [] });
    await mockApi(page, PRIVACY_API);
    await page.goto('/app/privacidad/autorizaciones');
    await expect(page.getByText('No tiene acceso a esta sección')).toBeVisible();
  });
});

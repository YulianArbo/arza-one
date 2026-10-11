import { mockApi, mockPermissions, type ApiRoutes } from './support/api-mock';
import { accessibilityViolations, expect, test, useTheme } from './support/fixtures';

// Pantallas de terceros de B13: accesibilidad WCAG 2.2 AA en modo claro y oscuro, la ficha con
// sus pestañas, el aviso del dígito del NIT y quien no tiene permiso.

const ORG = '01999a00-0000-7000-8000-00000000f001';
const USER = '01999a00-0000-7000-8000-00000000a099';

const SUMMARY = {
  id: ORG,
  kind: 'organization',
  name: 'Comercializadora Andina S.A.S.',
  id_type: 'NIT',
  id_number: '800197268',
  check_digit: 4,
  email: 'compras@andina.example',
  phone: null,
  city: 'Medellín',
  status: 'active',
  roles: ['customer'],
  version: 1,
};

const DETAIL = {
  ...SUMMARY,
  first_name: null,
  last_name: null,
  legal_name: SUMMARY.name,
  trade_name: null,
  address: null,
  status_reason: null,
  data_purpose: null,
  data_authorization: null,
  data_authorized_on: null,
  role_history: [{ role: 'customer', since: '2026-01-15', is_active: true }],
  due_diligence: { state: 'pending', next_review_on: null },
  created_at: '2026-01-15T14:00:00.000Z',
};

const REQUEST = {
  requested_by: { id: USER, display_name: 'Luis Mora' },
  requested_at: '2026-10-01T15:00:00.000Z',
  reviewed_by: null,
  reviewed_at: null,
  review_note: null,
};

const catalog = (key: string, code: string, label: string) => ({
  body: {
    key,
    name: key,
    description: null,
    item_count: 1,
    items: [{ id: USER, code, label, sort_order: 0, is_active: true, version: 1 }],
  },
});

const PARTY_API: ApiRoutes = {
  '/v1/parties': { body: { data: [SUMMARY], next_cursor: null } },
  '/v1/parties/search': { body: { data: [] } },
  [`/v1/parties/${ORG}`]: { body: DETAIL },
  [`/v1/parties/${ORG}/contacts`]: { body: { data: [] } },
  [`/v1/parties/${ORG}/bank-accounts`]: {
    body: {
      data: [
        {
          id: USER,
          bank: 'BANCOLOMBIA',
          account_type: 'savings',
          number_masked: '•••• 6789',
          status: 'pending',
          replaces_id: null,
          ...REQUEST,
        },
      ],
    },
  },
  [`/v1/parties/${ORG}/due-diligence`]: {
    body: {
      data: [
        {
          id: USER,
          risk_level: 'low',
          summary: 'Revisión de RUT y listas.',
          status: 'pending',
          next_review_on: null,
          ...REQUEST,
        },
      ],
    },
  },
  [`/v1/parties/${ORG}/timeline`]: {
    body: {
      data: [
        {
          id: USER,
          occurred_at: '2026-10-01T15:00:00.000Z',
          actor_name: 'Luis Mora',
          action: 'party.create',
          entity_type: 'party',
          changes: {},
        },
      ],
      next_cursor: null,
    },
  },
  '/v1/catalogs/identification_types': catalog('identification_types', 'NIT', 'NIT'),
  '/v1/catalogs/personal_data_purposes': catalog(
    'personal_data_purposes',
    'COMMERCIAL',
    'Comercial',
  ),
  '/v1/catalogs/banks': catalog('banks', 'BANCOLOMBIA', 'Bancolombia'),
};

const PAGES = [
  { path: '/app/terceros', ready: 'Comercializadora Andina S.A.S.', tab: null },
  { path: '/app/terceros/nuevo', ready: 'Razón social', tab: null },
  { path: `/app/terceros/${ORG}`, ready: 'Desde el 15/01/2026', tab: null },
  { path: `/app/terceros/${ORG}`, ready: '•••• 6789', tab: 'Cuentas bancarias' },
  { path: `/app/terceros/${ORG}`, ready: 'Revisión de RUT y listas.', tab: 'Conocimiento' },
  { path: `/app/terceros/${ORG}`, ready: 'Registró un tercero', tab: 'Línea de tiempo' },
] as const;

for (const theme of ['light', 'dark'] as const) {
  test.describe(`terceros en modo ${theme === 'light' ? 'claro' : 'oscuro'}`, () => {
    for (const { path, ready, tab } of PAGES) {
      test(`${path} ${tab ?? ''} no tiene violaciones de accesibilidad`, async ({
        page,
        consoleErrors,
      }) => {
        await useTheme(page, theme);
        await mockApi(page, PARTY_API);
        await page.goto(path);
        if (tab !== null) await page.getByRole('tab', { name: tab }).click();
        await expect(page.getByText(ready).first()).toBeVisible();
        expect(await accessibilityViolations(page)).toEqual([]);
        expect(consoleErrors).toEqual([]);
      });
    }
  });
}

test.describe('registro de un tercero', () => {
  test('un NIT con el dígito equivocado no se envía', async ({ page }) => {
    await mockApi(page, PARTY_API);
    await page.goto('/app/terceros/nuevo');
    await page.getByLabel('Razón social').fill('Andina S.A.S.');
    await page.getByLabel('Número de documento').fill('800197268');
    await page.getByLabel('Dígito de verificación').fill('5');
    await page.getByRole('button', { name: 'Guardar' }).click();
    await expect(
      page.getByText('El dígito de verificación no corresponde a ese NIT'),
    ).toBeVisible();
  });
});

test.describe('quien no maneja terceros', () => {
  test('un colaborador ve «Sin permiso» si escribe la dirección', async ({ page }) => {
    await mockPermissions(page, { roles: [], permissions: [] });
    await mockApi(page, PARTY_API);
    await page.goto('/app/terceros');
    await expect(page.getByText('No tiene acceso a esta sección')).toBeVisible();
  });
});

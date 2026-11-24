import { mockApi, type ApiRoutes } from './support/api-mock';
import { accessibilityViolations, expect, test, useTheme } from './support/fixtures';

// Pantallas de privacidad de B42: accesibilidad WCAG 2.2 AA en modo claro y oscuro de las
// solicitudes de titulares, los incidentes, las cookies y los derechos del titular en el sitio, y
// el envío de una solicitud desde el sitio público. Datos ficticios.

const REQUEST = '01999a00-0000-7000-8000-00000000e001';
const INCIDENT = '01999a00-0000-7000-8000-00000000e101';

const SUMMARY = {
  id: REQUEST,
  code: 'PRV-2026-0001',
  right: 'know',
  kind: 'inquiry',
  channel: 'web',
  status: 'received',
  requester_name: 'Laura Titular',
  party: null,
  received_at: '2026-11-20T15:00:00.000Z',
  due_on: '2026-12-04',
  overdue: false,
  extended: false,
  paused: false,
  version: 1,
};

const DETAIL = {
  ...SUMMARY,
  requester_email: 'laura@ejemplo.test',
  requester_phone: null,
  document_number: '1000000001',
  description: 'Quiero conocer mis datos.',
  source_code: null,
  verification: null,
  requirement: null,
  extension_reason: null,
  requirement_open_until: null,
  response: null,
  responded_at: null,
  closure: null,
  closed_at: null,
  exports: [],
  erasure: null,
  events: [
    {
      kind: 'received',
      note: null,
      actor: null,
      occurred_at: '2026-11-20T15:00:00.000Z',
      mailed_at: null,
    },
  ],
};

const INCIDENT_DETAIL = {
  id: INCIDENT,
  code: 'IDP-2026-0001',
  title: 'Correo a un destinatario equivocado',
  status: 'open',
  detected_at: '2026-11-20T15:00:00.000Z',
  affected_count: 12,
  sensitive: false,
  sic_due_on: '2026-12-11',
  reported_on: null,
  overdue: false,
  version: 1,
  description: 'Se envió un archivo con datos de contacto a una persona externa.',
  data_categories: ['contact'],
  project_incident_ref: null,
  contained_at: null,
  containment_note: null,
  sic_reference: null,
  holders_notified_on: null,
  holders_notice: null,
  not_reportable_reason: null,
  closed_at: null,
  measures: [],
};

const API: ApiRoutes = {
  '/v1/privacy-requests': { body: { data: [SUMMARY], next_cursor: null } },
  [`/v1/privacy-requests/${REQUEST}`]: { body: DETAIL },
  '/v1/privacy-incidents': { body: { data: [INCIDENT_DETAIL] } },
  [`/v1/privacy-incidents/${INCIDENT}`]: { body: INCIDENT_DETAIL },
  '/v1/privacy/cookie-consents': { body: { data: [], next_cursor: null } },
  '/v1/privacy/cookie-consents/report': {
    body: {
      from: '2026-11-01',
      to: '2026-11-30',
      total: 3,
      only_necessary: 2,
      by_category: [{ category: 'necessary', count: 3 }],
      by_version: [{ policy_version: 1, count: 3 }],
    },
  },
  '/v1/public/privacy-requests': {
    status: 201,
    body: {
      code: 'PRV-2026-0007',
      kind: 'inquiry',
      received_at: '2026-11-23T15:00:00.000Z',
      due_on: '2026-12-07',
    },
  },
};

const PAGES = [
  { path: '/app/privacidad/solicitudes', ready: 'PRV-2026-0001' },
  { path: `/app/privacidad/solicitudes/${REQUEST}`, ready: 'Historia' },
  { path: '/app/privacidad/incidentes', ready: 'IDP-2026-0001' },
  { path: `/app/privacidad/incidentes/${INCIDENT}`, ready: 'Bitácora de medidas' },
  { path: '/app/privacidad/cookies', ready: 'Versión 1' },
  { path: '/derechos-del-titular', ready: 'Sus derechos sobre sus datos' },
  { path: '/derechos-del-titular/consulta', ready: 'Consultar una solicitud' },
];

for (const theme of ['light', 'dark'] as const) {
  test.describe(`privacidad B42 en modo ${theme === 'light' ? 'claro' : 'oscuro'}`, () => {
    test.slow();
    for (const { path, ready } of PAGES) {
      test(`${path} no tiene violaciones de accesibilidad`, async ({ page, consoleErrors }) => {
        await useTheme(page, theme);
        await mockApi(page, API);
        await page.goto(path);
        await expect(page.getByText(ready, { exact: true }).first()).toBeVisible();
        expect(await accessibilityViolations(page)).toEqual([]);
        expect(consoleErrors).toEqual([]);
      });
    }
  });
}

test('el titular presenta su solicitud en el sitio y recibe el código', async ({
  page,
  consoleErrors,
}) => {
  await mockApi(page, API);
  await page.goto('/derechos-del-titular');
  await page.getByLabel('Nombre completo').fill('Laura Titular');
  await page.getByLabel('Número de documento').fill('1000000001');
  await page.getByLabel('Correo', { exact: true }).fill('laura@ejemplo.test');
  await page.getByLabel('Cuéntenos qué necesita').fill('Quiero conocer mis datos.');
  await page.getByRole('checkbox').check();
  await page.getByRole('button', { name: 'Enviar la solicitud' }).click();
  await expect(page.getByText('PRV-2026-0007')).toBeVisible();
  await expect(page.getByText(/07\/12\/2026/u)).toBeVisible();
  expect(consoleErrors).toEqual([]);
});

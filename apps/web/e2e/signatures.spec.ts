import type { Page } from '@playwright/test';

import { mockApi, type ApiRoutes } from './support/api-mock';
import { E2E_API_URL, E2E_WEB_URL } from './support/environment';
import { accessibilityViolations, expect, test, useTheme } from './support/fixtures';

// Firma electrónica (B25): el recorrido de quien firma por el cliente en la página de firma, la
// verificación pública y la pestaña Firmas de la ficha, sin violaciones de accesibilidad WCAG 2.2 AA
// en modo claro y oscuro. Datos ficticios.

const CONTRACT = '01999a00-0000-7000-8000-0000000d0001';
const ENVELOPE = '01999a00-0000-7000-8000-0000000e0001';
const TOKEN = 'F'.repeat(43);
const ME = '01999a00-0000-7000-8000-00000000a001';

const VIEW = {
  company: { name: 'ARZA TECH S.A.S.', tax_id: '900000000-1' },
  document: {
    code: 'CTR-2026-0001',
    title: 'Portal de clientes',
    kind: 'Contrato',
    sha256: 'b'.repeat(64),
  },
  signer: {
    name: 'Laura Gómez',
    id_number: 'CC 43000000',
    role: 'Por Comercializadora Andina S.A.S.',
    email_hint: 'la***@cliente.test',
  },
  state: 'pending',
  acceptance_text: 'He leído y acepto el contenido de este documento y lo firmo electrónicamente.',
  expires_at: '2099-11-15T04:59:59.999Z',
  signed_at: null,
  code_locked: false,
  signed_copy: false,
};

function signer(overrides: object): object {
  return {
    id: '01999a00-0000-7000-8000-0000000e0101',
    kind: 'client',
    sign_order: 1,
    name: 'Laura Gómez',
    email: 'laura@cliente.test',
    id_number: 'CC 43000000',
    role: 'Por Comercializadora Andina S.A.S.',
    status: 'signed',
    method: 'email_code',
    opened_at: '2026-10-30T15:30:00.000Z',
    signed_at: '2026-10-30T16:00:00.000Z',
    rejected_at: null,
    reject_reason: null,
    reminders: 0,
    code_locked: false,
    is_me: false,
    ...overrides,
  };
}

const ENVELOPE_VIEW = {
  id: ENVELOPE,
  code: 'FE-2026-0001',
  source: 'contract',
  document: {
    id: CONTRACT,
    code: 'CTR-2026-0001',
    title: 'Portal de clientes',
    sha256: 'b'.repeat(64),
  },
  status: 'sent',
  message: null,
  expires_at: '2099-11-15T04:59:59.999Z',
  sent_at: '2026-10-30T15:05:00.000Z',
  completed_at: null,
  closed_reason: null,
  signed: null,
  signers: [
    signer({}),
    signer({
      id: '01999a00-0000-7000-8000-0000000e0102',
      kind: 'company',
      sign_order: 2,
      name: 'Ana Pérez',
      email: 'ana@demo-uno.test',
      id_number: 'CC 80000000',
      role: 'Por ARZA TECH S.A.S.',
      status: 'pending',
      method: null,
      opened_at: null,
      signed_at: null,
      is_me: true,
    }),
  ],
  events: [
    {
      id: '01999a00-0000-7000-8000-0000000e0301',
      type: 'signed',
      signer_name: 'Laura Gómez',
      occurred_at: '2026-10-30T16:00:00.000Z',
      ip: '190.0.0.1',
      user_agent: 'Navegador',
      hash: 'c'.repeat(64),
    },
  ],
  chain_intact: true,
  created_at: '2026-10-30T15:00:00.000Z',
  version: 3,
};

const OWNER = { id: ME, name: 'Ana Pérez' };

const DETAIL = {
  id: CONTRACT,
  code: 'CTR-2026-0001',
  kind: 'contract',
  title: 'Portal de clientes',
  party: { id: '01999a00-0000-7000-8000-00000000f001', name: 'Comercializadora Andina S.A.S.' },
  status: 'in_signature',
  value: '12000000.00',
  starts_on: '2026-11-01',
  ends_on: '2027-10-31',
  responsible: OWNER,
  has_modified_clauses: false,
  created_at: '2026-10-29T15:00:00.000Z',
  version: 4,
  object: 'desarrollar el portal de autogestión de los clientes',
  payment_terms: '50 % al iniciar y 50 % a la entrega',
  renewal: 'by_agreement',
  client_signer_name: 'Laura Gómez',
  client_signer_document: 'CC 43000000',
  template: {
    id: '01999a00-0000-7000-8000-0000000d0101',
    code: 'CT-COM-001',
    name: 'Contrato de desarrollo de software',
  },
  quote: null,
  author: OWNER,
  clauses: [],
  approval: {
    submitted_at: '2026-10-29T16:00:00.000Z',
    decided_by: { id: '01999a00-0000-7000-8000-00000000a002', name: 'Diego Director' },
    decided_at: '2026-10-29T17:00:00.000Z',
    note: null,
    legal_note: null,
  },
  pdf: { status: 'ready', file_name: 'CTR-2026-0001.pdf', sha256: 'b'.repeat(64) },
  signed: null,
  termination: null,
  last_alert_days: null,
  obligations: [],
  amendments: [],
};

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

function api(view: () => object): ApiRoutes {
  return {
    '/v1/public/signatures/open': () => ({ body: view() }),
    '/v1/public/signatures/code': { status: 204, body: null },
    '/v1/public/signatures/verify-code': {
      body: { ticket: 'T'.repeat(43), expires_at: '2099-10-30T16:00:00.000Z' },
    },
    '/v1/public/signatures/sign': { status: 204, body: null },
    '/v1/public/verifications': { body: FOUND },
    [`/v1/contracts/${CONTRACT}`]: { body: DETAIL },
    '/v1/signature-envelopes': { body: { items: [ENVELOPE_VIEW] } },
    '/v1/comments': { body: { items: [] } },
    '/v1/attachments': { body: { items: [] } },
  };
}

/** El PDF del documento, como lo entrega la API. */
async function servePdf(page: Page): Promise<void> {
  await page.route(`${E2E_API_URL}/v1/public/signatures/document`, async (route) => {
    await route.fulfill({
      status: 200,
      headers: {
        'Access-Control-Allow-Origin': E2E_WEB_URL,
        'Access-Control-Allow-Credentials': 'true',
      },
      contentType: 'application/pdf',
      body: '%PDF-1.7\n%%EOF\n',
    });
  });
}

test.describe('la página de firma', () => {
  test.slow();

  test('quien firma por el cliente valida el código, lee y firma', async ({ page }) => {
    let state = 'pending';
    await mockApi(
      page,
      api(() => ({ ...VIEW, state })),
    );
    await servePdf(page);
    await page.goto(`/firmar#token=${TOKEN}`);
    await expect(page.getByRole('heading', { name: 'Contrato CTR-2026-0001' })).toBeVisible();
    expect(page.url()).not.toContain(TOKEN);
    await page.getByRole('button', { name: 'Enviarme el código' }).click();
    await page.getByLabel('Código del correo').fill('123456');
    await page.getByRole('button', { name: 'Validar el código' }).click();
    await expect(page.getByTitle('Contrato CTR-2026-0001')).toBeVisible();
    await page.getByLabel(/He leído y acepto/u).check();
    state = 'signed';
    await page.getByRole('button', { name: 'Firmar el documento' }).click();
    await expect(page.getByText('Usted ya firmó')).toBeVisible();
  });

  test('en el celular se lee sin desplazarse a los lados', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await mockApi(
      page,
      api(() => VIEW),
    );
    await page.goto(`/firmar#token=${TOKEN}`);
    await expect(page.getByRole('button', { name: 'Enviarme el código' })).toBeVisible();
    const width = await page.evaluate(() => document.documentElement.scrollWidth);
    expect(width).toBeLessThanOrEqual(390);
    expect(await accessibilityViolations(page)).toEqual([]);
  });
});

test.describe('la verificación pública', () => {
  test.slow();

  test('con el código dice que el documento es auténtico', async ({ page }) => {
    await mockApi(
      page,
      api(() => VIEW),
    );
    await page.goto('/verificar');
    await page.getByLabel('Código de verificación').fill('ABCD-EFGH-JKLM');
    await page.getByRole('button', { name: 'Verificar' }).click();
    await expect(page.getByText(/es auténtico/u)).toBeVisible();
  });
});

const PAGES = [
  { path: `/firmar#token=${TOKEN}`, ready: 'Enviarme el código', tab: null, name: 'la de firma' },
  { path: '/verificar', ready: 'Verificar', tab: null, name: 'la de verificación' },
  {
    path: `/app/contratos/${CONTRACT}`,
    ready: 'Firmar por la empresa',
    tab: 'Firmas',
    name: 'la pestaña Firmas',
  },
] as const;

for (const theme of ['light', 'dark'] as const) {
  test.describe(`Firma electrónica en modo ${theme === 'light' ? 'claro' : 'oscuro'}`, () => {
    test.slow();
    for (const item of PAGES) {
      test(`${item.name} no tiene violaciones de accesibilidad`, async ({
        page,
        consoleErrors,
      }) => {
        await useTheme(page, theme);
        await mockApi(
          page,
          api(() => VIEW),
        );
        await page.goto(item.path);
        if (item.tab !== null) await page.getByRole('tab', { name: item.tab }).click();
        await expect(page.getByRole('button', { name: item.ready }).first()).toBeVisible();
        expect(await accessibilityViolations(page)).toEqual([]);
        expect(consoleErrors).toEqual([]);
      });
    }
  });
}

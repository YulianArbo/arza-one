import { screen, within } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { Screen } from '../../test-support/core-fixtures';
import {
  SESSION,
  json,
  mockApi,
  noContent,
  renderWithApi,
  type SentRequest,
} from '../../test-support/fake-api';
import { permissionsOf } from '../../test-support/party-fixtures';
import { FinanceInvoicesPanel } from './invoices-panel';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace: vi.fn(), push: vi.fn() }),
  usePathname: () => '/app/finanzas/facturas',
}));

const INVOICE_ID = '01999a00-0000-7000-8000-0000000fa701';
const OTHER_INVOICE_ID = '01999a00-0000-7000-8000-0000000fa801';
const MILESTONE_ID = '01999a00-0000-7000-8000-0000000fa601';
const PARTY_ID = '01999a00-0000-7000-8000-0000000fa501';
const FILE_ID = '01999a00-0000-7000-8000-0000000fa401';

const FINANCE = permissionsOf([
  'finance.invoice.read',
  'finance.invoice.request',
  'finance.invoice.approve',
  'finance.invoice.register_fiscal',
  'finance.invoice.void',
  'finance.payment.manage',
]);

const MILESTONE = {
  id: MILESTONE_ID,
  project_code: 'PRY-2026-0001',
  project_name: 'Implementación',
  party: { id: PARTY_ID, name: 'Comercializadora Andina S.A.S.' },
  contract_id: null,
  name: 'Entrega',
  amount: '1000.00',
};

const INVOICE = {
  id: INVOICE_ID,
  code: 'FAC-2026-0001',
  party: MILESTONE.party,
  milestone_id: MILESTONE_ID,
  requested_amount: '1000.00',
  status: 'requested',
  issue_date: null,
  due_date: null,
  subtotal: null,
  tax_total: null,
  withholding_total: null,
  total: null,
  fiscal_number: null,
  fiscal_uuid: null,
  fiscal_file_id: null,
  paid_total: '0.00',
  balance: null,
  version: 1,
} as const;

const APPROVED = {
  ...INVOICE,
  id: OTHER_INVOICE_ID,
  code: 'FAC-2026-0002',
  status: 'approved',
  version: 2,
} as const;

const ISSUED = {
  ...APPROVED,
  status: 'issued',
  issue_date: '2026-11-08',
  due_date: '2026-12-08',
  subtotal: '1000.00',
  tax_total: '190.00',
  withholding_total: '0.00',
  total: '1190.00',
  fiscal_number: 'FE-001',
  fiscal_file_id: FILE_ID,
  balance: '1190.00',
  version: 3,
} as const;

const FILE = {
  id: FILE_ID,
  file_name: 'factura.pdf',
  mime_type: 'application/pdf',
  size_bytes: 12,
  sha256: null,
  status: 'available',
  rejection: null,
  created_at: '2026-11-08T15:00:00.000Z',
};

function serve(
  extras: Record<string, (request: SentRequest) => Response> = {},
  invoices: object[] = [],
  milestones: object[] = [MILESTONE],
): SentRequest[] {
  return mockApi({
    'GET /v1/auth/session': () => json(SESSION),
    'GET /v1/me/permissions': () => json(FINANCE),
    'GET /v1/finance/invoices': () => json({ data: invoices }),
    'GET /v1/finance/invoices/billable-milestones': () => json({ data: milestones }),
    ...extras,
  });
}

async function chooseAndUpload(dialog: HTMLElement, label: string): Promise<void> {
  const file = new File(['%PDF-1.7'], 'factura.pdf', { type: 'application/pdf' });
  await userEvent.upload(within(dialog).getByLabelText(label), file);
  await userEvent.click(within(dialog).getByRole('button', { name: 'Subir archivo' }));
}

beforeEach(() => {
  vi.stubGlobal('scrollTo', vi.fn());
});

afterEach(() => {
  vi.unstubAllGlobals();
});

const UPLOAD_ROUTES = {
  'POST /v1/files': () =>
    json({
      id: FILE_ID,
      upload_url: 'http://api.test/subida/factura',
      expires_at: '2026-11-08T15:05:00.000Z',
    }),
  'PUT /subida/factura': () => noContent(),
  [`GET /v1/files/${FILE_ID}`]: () => json(FILE),
};

function show(): void {
  renderWithApi(
    <Screen>
      <FinanceInvoicesPanel />
    </Screen>,
  );
}

async function requestFromMilestone(sent: SentRequest[]): Promise<void> {
  expect(await screen.findByText('Aún no hay facturas')).toBeVisible();
  await userEvent.click(screen.getByRole('button', { name: 'Solicitar factura' }));
  const dialog = await screen.findByRole('dialog');
  await userEvent.selectOptions(
    within(dialog).getByLabelText('Hito listo para facturar'),
    MILESTONE_ID,
  );
  await userEvent.click(within(dialog).getByRole('button', { name: 'Solicitar factura' }));
  await vi.waitFor(() => {
    expect(sent.find((request) => request.method === 'POST')?.body).toEqual({
      milestone_id: MILESTONE_ID,
    });
  });
  expect(await screen.findByText('Solicitud registrada.')).toBeVisible();
}

async function approveAndVoid(sent: SentRequest[]): Promise<void> {
  expect(await screen.findByText(/FAC-2026-0001/u)).toBeVisible();
  await userEvent.click(screen.getByRole('button', { name: 'Aprobar' }));
  await vi.waitFor(() => {
    expect(sent.some((request) => request.path.endsWith(`/${INVOICE_ID}/approval`))).toBe(true);
  });
  await userEvent.click(screen.getByRole('button', { name: 'Anular' }));
  const dialog = await screen.findByRole('dialog');
  await userEvent.click(within(dialog).getByRole('button', { name: 'Anular factura' }));
  expect(
    within(dialog).getByText('Escriba el motivo de la anulación (mínimo 3 caracteres).'),
  ).toBeVisible();
  await userEvent.type(within(dialog).getByLabelText('Motivo de la anulación'), 'Duplicada');
  await userEvent.click(within(dialog).getByRole('button', { name: 'Anular factura' }));
  await vi.waitFor(() => {
    expect(sent.find((request) => request.path.endsWith(`/${INVOICE_ID}/void`))?.body).toEqual({
      reason: 'Duplicada',
    });
  });
}

async function registerFiscal(sent: SentRequest[]): Promise<void> {
  await userEvent.click(await screen.findByRole('button', { name: 'Registrar factura fiscal' }));
  const dialog = await screen.findByRole('dialog');
  await userEvent.click(within(dialog).getByRole('button', { name: 'Registrar documento fiscal' }));
  expect(
    within(dialog).getByText(
      'Revise las fechas, los valores registrados y el archivo fiscal disponible.',
    ),
  ).toBeVisible();
  await fillFiscal(dialog);
  await chooseAndUpload(dialog, 'Soporte fiscal (PDF recomendado)');
  expect(await within(dialog).findByText('factura.pdf')).toBeVisible();
  await userEvent.click(within(dialog).getByRole('button', { name: 'Registrar documento fiscal' }));
  await vi.waitFor(() => {
    expect(
      sent.find((request) => request.path.endsWith(`/${OTHER_INVOICE_ID}/fiscal-document`))?.body,
    ).toMatchObject({ total: '1190.00', fiscal_number: 'FE-001', fiscal_file_id: FILE_ID });
  });
}

async function fillFiscal(dialog: HTMLElement): Promise<void> {
  await userEvent.type(within(dialog).getByLabelText('Fecha de emisión'), '2026-11-08');
  await userEvent.type(within(dialog).getByLabelText('Fecha de vencimiento'), '2026-12-08');
  await userEvent.clear(within(dialog).getByLabelText('Subtotal registrado'));
  await userEvent.type(within(dialog).getByLabelText('Subtotal registrado'), '1000.00');
  await userEvent.type(within(dialog).getByLabelText('Tarifa registrada (%)'), '19.00');
  await userEvent.type(within(dialog).getByLabelText('Impuestos registrados'), '190.00');
  await userEvent.type(within(dialog).getByLabelText('Retenciones registradas'), '0.00');
  await userEvent.type(within(dialog).getByLabelText('Total fiscal'), '1190.00');
  await userEvent.type(within(dialog).getByLabelText('Número fiscal'), 'FE-001');
}

async function pay(sent: SentRequest[]): Promise<void> {
  await userEvent.click(await screen.findByRole('button', { name: 'Registrar recaudo' }));
  const dialog = await screen.findByRole('dialog');
  await userEvent.click(within(dialog).getByRole('button', { name: 'Registrar recaudo' }));
  expect(
    within(dialog).getByText('Revise la fecha, el valor y el medio del recaudo.'),
  ).toBeVisible();
  await userEvent.type(within(dialog).getByLabelText('Fecha del recaudo'), '2026-11-10');
  await userEvent.type(within(dialog).getByLabelText('Valor recibido'), '1190.00');
  await userEvent.type(within(dialog).getByLabelText('Medio de pago'), 'Transferencia');
  await userEvent.click(within(dialog).getByRole('button', { name: 'Registrar recaudo' }));
  await vi.waitFor(() => {
    expect(
      sent.find((request) => request.path.endsWith(`/${OTHER_INVOICE_ID}/payments`))?.body,
    ).toMatchObject({ amount: '1190.00', method: 'Transferencia' });
  });
  await vi.waitFor(() => {
    expect(screen.queryByRole('dialog')).toBeNull();
  });
}

async function credit(sent: SentRequest[]): Promise<void> {
  await userEvent.click(screen.getByRole('button', { name: 'Nota crédito' }));
  const dialog = await screen.findByRole('dialog');
  await userEvent.type(within(dialog).getByLabelText('Motivo'), 'Ajuste de precio');
  await userEvent.type(within(dialog).getByLabelText('Valor de la nota crédito'), '200.00');
  await userEvent.type(within(dialog).getByLabelText('Fecha de emisión'), '2026-11-10');
  await userEvent.type(within(dialog).getByLabelText('Número fiscal'), 'NC-001');
  await chooseAndUpload(dialog, 'Soporte fiscal de la nota crédito');
  expect(await within(dialog).findByText('factura.pdf')).toBeVisible();
  await userEvent.click(within(dialog).getByRole('button', { name: 'Registrar nota crédito' }));
  await vi.waitFor(() => {
    expect(
      sent.find((request) => request.path.endsWith(`/${OTHER_INVOICE_ID}/credit-notes`))?.body,
    ).toMatchObject({ amount: '200.00', fiscal_number: 'NC-001', fiscal_file_id: FILE_ID });
  });
}

const APPROVAL_ROUTES = {
  [`POST /v1/finance/invoices/${INVOICE_ID}/approval`]: () => noContent(),
  [`POST /v1/finance/invoices/${INVOICE_ID}/void`]: () => noContent(),
};

const FISCAL_ROUTES = {
  ...UPLOAD_ROUTES,
  [`POST /v1/finance/invoices/${OTHER_INVOICE_ID}/fiscal-document`]: () => noContent(),
};

const SETTLEMENT_ROUTES = {
  ...UPLOAD_ROUTES,
  [`POST /v1/finance/invoices/${OTHER_INVOICE_ID}/payments`]: () => json({ id: INVOICE_ID }, 201),
  [`POST /v1/finance/invoices/${OTHER_INVOICE_ID}/credit-notes`]: () =>
    json({ id: INVOICE_ID }, 201),
};

describe('facturación', () => {
  it('solicita una factura desde un hito listo para facturar', async () => {
    const sent = serve({ 'POST /v1/finance/invoices': () => json({ id: INVOICE_ID }, 201) }, []);
    show();
    await requestFromMilestone(sent);
  });

  it('aprueba una solicitud y la anula con su motivo', async () => {
    const sent = serve(APPROVAL_ROUTES, [INVOICE]);
    show();
    await approveAndVoid(sent);
  });

  it('registra el documento fiscal con su soporte y valida los datos', async () => {
    const sent = serve(FISCAL_ROUTES, [APPROVED]);
    show();
    await registerFiscal(sent);
  });

  it('registra un recaudo y una nota crédito sobre una factura emitida', async () => {
    const sent = serve(SETTLEMENT_ROUTES, [ISSUED]);
    show();
    await pay(sent);
    await credit(sent);
  });
});

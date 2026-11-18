import type { EmployeeDetail, PermissionCode } from '@arza/contracts';
import { screen, within } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

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
import { EmployeePanel } from './employee-panel';
import { CANDIDATE, CANDIDATE_ID, EMPLOYEE_ID, employeeDetail } from './hr-fixtures';
import { HrHome } from './hr-home';

// Formularios de Talento humano (B35): preparar el contrato laboral con la banda salarial de la
// lista, registrar un documento de la historia laboral y completar una tarea de inducción.

const push = vi.fn();
vi.mock('next/navigation', () => ({
  usePathname: () => '/app/talento-y-sst',
  useRouter: () => ({ push, replace: vi.fn() }),
}));

const PATH = `/v1/hr/employees/${EMPLOYEE_ID}`;
const HR: readonly PermissionCode[] = [
  'hr.candidate.manage',
  'hr.employee.read',
  'hr.employee.manage',
  'hr.file.read',
];
const ID = (n: number) => `01999a00-0000-7000-8000-0000000fd4${String(n).padStart(2, '0')}`;
const PDF = {
  id: ID(1),
  file_name: 'contrato-ana.pdf',
  mime_type: 'application/pdf',
  size_bytes: 1000,
  sha256: '0'.repeat(64),
  status: 'available',
  rejection: null,
  created_at: '2026-11-17T15:00:00.000Z',
};
const BANDS = {
  key: 'hr_salary_bands',
  name: 'Bandas salariales',
  description: null,
  item_count: 2,
  items: [
    { id: ID(2), code: 'BANDA_1', label: 'Banda 1', sort_order: 10, is_active: true, version: 1 },
    { id: ID(3), code: 'BANDA_9', label: 'Retirada', sort_order: 20, is_active: false, version: 1 },
  ],
};

function serve(routes: object): SentRequest[] {
  return mockApi({
    'GET /v1/auth/session': () => json(SESSION),
    'GET /v1/me/permissions': () => json(permissionsOf(HR)),
    'GET /v1/files': () => json({ data: [PDF] }),
    ...routes,
  });
}

function sentTo(sent: readonly SentRequest[], ending: string): SentRequest | undefined {
  return sent.find((request) => request.method !== 'GET' && request.path.endsWith(ending));
}

beforeEach(() => {
  vi.stubGlobal('scrollTo', vi.fn());
});

afterEach(() => {
  vi.unstubAllGlobals();
  push.mockReset();
});

async function fillHiring(dialog: HTMLElement): Promise<void> {
  const field = (label: string) => within(dialog).getByLabelText(label);
  await userEvent.selectOptions(field('Cargo'), ID(4));
  await userEvent.clear(field('Fecha de ingreso'));
  await userEvent.type(field('Fecha de ingreso'), '2026-12-01');
  await userEvent.selectOptions(field('Tipo de contrato'), 'fixed');
  await userEvent.type(field('Fecha de terminación'), '2027-11-30');
  await userEvent.selectOptions(field('Modalidad'), 'telework');
  await userEvent.selectOptions(field('Banda salarial'), 'BANDA_1');
  await userEvent.type(field('Salario mensual en pesos'), '3500000');
  await userEvent.type(field('Correo de la cuenta de trabajo'), 'ana.prueba@empresa.test');
  await userEvent.selectOptions(field('PDF disponible'), ID(1));
  await userEvent.selectOptions(field('Firma por la empresa'), ID(5));
}

const HIRING_ROUTES = {
  'GET /v1/hr/vacancies': () => json({ data: [] }),
  'GET /v1/hr/candidates': () => json({ data: [{ ...CANDIDATE, stage: 'selected' }] }),
  'GET /v1/hr/employees': () => json({ data: [] }),
  'GET /v1/hr/vacancies/positions': () => json({ data: [{ id: ID(4), name: 'Analista' }] }),
  'GET /v1/hr/employees/company-signers': () =>
    json({
      data: [
        { id: ID(5), name: 'Directora', ready: true },
        { id: ID(6), name: 'Sin vincular', ready: false },
      ],
    }),
  'GET /v1/catalogs/hr_salary_bands': () => json(BANDS),
  [`POST /v1/hr/candidates/${CANDIDATE_ID}/actions/prepare-hiring`]: () =>
    json({ id: EMPLOYEE_ID }, 201),
};

it('prepara el contrato con la banda de la lista y abre la ficha nueva', async () => {
  const sent = serve(HIRING_ROUTES);
  renderWithApi(
    <Screen>
      <HrHome />
    </Screen>,
  );
  await userEvent.click(await screen.findByRole('button', { name: 'Preparar contrato' }));
  const dialog = await screen.findByRole('dialog');
  const band = await within(dialog).findByLabelText('Banda salarial');
  expect(within(band).queryByText('Retirada')).not.toBeInTheDocument();
  expect(within(dialog).queryByText('Sin vincular')).not.toBeInTheDocument();
  await fillHiring(dialog);
  await userEvent.click(within(dialog).getByRole('button', { name: 'Enviar contrato a firma' }));
  await vi.waitFor(() => {
    expect(sentTo(sent, '/prepare-hiring')?.body).toMatchObject({
      contract_type: 'fixed',
      ends_on: '2027-11-30',
      salary_band: 'BANDA_1',
      message: null,
    });
  });
  expect(sentTo(sent, '/prepare-hiring')?.headers['If-Match']).toBe('"3"');
  await vi.waitFor(() => {
    expect(push).toHaveBeenCalledWith(`/app/talento-y-sst/colaboradores/${EMPLOYEE_ID}`);
  });
});

function withFile(): EmployeeDetail {
  return {
    ...employeeDetail({ status: 'active' }),
    file: [
      { item: 'education', status: 'pending', file_id: null, note: null, version: 2 },
      { item: 'resume', status: 'received', file_id: ID(7), note: 'Copia', version: 1 },
      { item: 'signed_contract', status: 'received', file_id: ID(8), note: null, version: 1 },
    ],
    onboarding: [
      {
        id: ID(9),
        employee: { id: EMPLOYEE_ID, name: 'Ana Prueba' },
        kind: 'induction',
        title: 'Inducción institucional',
        responsible: null,
        due_on: '2026-12-06',
        done_on: null,
        note: null,
        version: 1,
      },
    ],
  };
}

it('registra un documento recibido con su soporte y la versión que vio', async () => {
  const sent = serve({
    [`GET ${PATH}`]: () => json(withFile()),
    [`PUT ${PATH}/file/education`]: () => noContent(),
  });
  renderWithApi(
    <Screen>
      <EmployeePanel id={EMPLOYEE_ID} />
    </Screen>,
  );
  expect(await screen.findByText('Copia')).toBeInTheDocument();
  const edit = await screen.findByRole('button', { name: 'Editar Certificados de estudio' });
  expect(
    screen.queryByRole('button', { name: 'Editar Contrato laboral firmado' }),
  ).not.toBeInTheDocument();
  await userEvent.click(edit);
  const dialog = await screen.findByRole('dialog');
  await userEvent.selectOptions(within(dialog).getByLabelText('Estado'), 'received');
  await userEvent.selectOptions(await within(dialog).findByLabelText('Soporte'), ID(1));
  await userEvent.click(within(dialog).getByRole('button', { name: 'Guardar estado' }));
  await vi.waitFor(() => {
    expect(sentTo(sent, '/file/education')?.body).toEqual({
      status: 'received',
      note: null,
      file_id: ID(1),
    });
  });
  expect(sentTo(sent, '/file/education')?.headers['If-Match']).toBe('"2"');
});

it('conserva el soporte actual y lo quita si el documento deja de estar recibido', async () => {
  const sent = serve({
    [`GET ${PATH}`]: () => json(withFile()),
    [`PUT ${PATH}/file/resume`]: () => noContent(),
  });
  renderWithApi(
    <Screen>
      <EmployeePanel id={EMPLOYEE_ID} />
    </Screen>,
  );
  await userEvent.click(await screen.findByRole('button', { name: 'Editar Hoja de vida' }));
  const dialog = await screen.findByRole('dialog');
  expect(await within(dialog).findByText('Conservar el soporte actual')).toBeInTheDocument();
  await userEvent.selectOptions(within(dialog).getByLabelText('Estado'), 'not_applicable');
  await userEvent.click(within(dialog).getByRole('button', { name: 'Guardar estado' }));
  await vi.waitFor(() => {
    expect(sentTo(sent, '/file/resume')?.body).toEqual({
      status: 'not_applicable',
      note: 'Copia',
      file_id: null,
    });
  });
});

it('completa una tarea de inducción con su fecha y observación', async () => {
  const sent = serve({
    [`GET ${PATH}`]: () => json(withFile()),
    [`POST ${PATH}/onboarding/${ID(9)}/actions/complete`]: () => noContent(),
  });
  renderWithApi(
    <Screen>
      <EmployeePanel id={EMPLOYEE_ID} />
    </Screen>,
  );
  await userEvent.click(
    await screen.findByRole('button', { name: 'Completar Inducción institucional' }),
  );
  const dialog = await screen.findByRole('dialog');
  const date = within(dialog).getByLabelText('Fecha de realización');
  await userEvent.clear(date);
  await userEvent.type(date, '2026-12-05');
  await userEvent.type(within(dialog).getByLabelText('Observación'), 'Asistió completa');
  await userEvent.click(within(dialog).getByRole('button', { name: 'Completar tarea' }));
  await vi.waitFor(() => {
    expect(sentTo(sent, '/actions/complete')?.body).toEqual({
      done_on: '2026-12-05',
      note: 'Asistió completa',
    });
  });
  expect(sentTo(sent, '/actions/complete')?.headers['If-Match']).toBe('"1"');
});

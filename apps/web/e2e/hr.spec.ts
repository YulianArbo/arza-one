import type { Page } from '@playwright/test';

import { fulfillJson, mockApi } from './support/api-mock';
import { E2E_API_URL } from './support/environment';
import { accessibilityViolations, expect, test } from './support/fixtures';

const id = '01999a00-0000-7000-8000-0000000fd101';
const employee = {
  id,
  name: 'Ana Prueba',
  position: { id, name: 'Analista' },
  hire_date: '2026-11-15',
  contract_type: 'indefinite',
  work_mode: 'on_site',
  status: 'active',
  user_id: id,
  candidate_id: null,
  version: 2,
};
const path = `/v1/hr/employees/${id}`;

interface SupportState {
  status: string;
  version: number;
}

/** Ficha del colaborador y la ruta que registra el estado del soporte. */
async function mockEmployeeFile(page: Page, state: SupportState): Promise<void> {
  await mockApi(page, {
    '/v1/hr/vacancies': { body: { data: [] } },
    '/v1/hr/candidates': { body: { data: [] } },
    '/v1/hr/employees': { body: { data: [employee] } },
    [path]: () => ({
      body: {
        employee,
        email: 'ana@ejemplo.test',
        contract: null,
        file: [
          {
            item: 'education',
            status: state.status,
            file_id: null,
            note: null,
            version: state.version,
          },
        ],
        onboarding: [],
      },
    }),
  });
  await page.route(`${E2E_API_URL}${path}/file/education`, async (route) => {
    expect(route.request().method()).toBe('PUT');
    expect(route.request().headers()['if-match']).toBe('"1"');
    expect(route.request().postDataJSON()).toMatchObject({ status: 'received' });
    state.status = 'received';
    state.version += 1;
    await fulfillJson(route, 204, undefined);
  });
}

test('abre la ficha laboral y registra el estado de un soporte', async ({
  page,
  consoleErrors,
}) => {
  const state: SupportState = { status: 'pending', version: 1 };
  await mockEmployeeFile(page, state);
  await page.goto('/app/talento-y-sst');
  await expect(page.getByRole('heading', { name: 'Talento Humano', level: 1 })).toBeVisible();
  await page.getByRole('link', { name: 'Ana Prueba' }).click();
  await expect(page.getByRole('heading', { name: 'Historia laboral' })).toBeVisible();
  await page.getByRole('button', { name: 'Editar Certificados de estudio' }).click();
  const dialog = page.getByRole('dialog');
  await expect(dialog).toBeVisible();
  expect(await accessibilityViolations(page)).toEqual([]);
  await dialog.getByLabel('Estado').selectOption('received');
  await dialog.getByRole('button', { name: 'Guardar estado' }).click();
  await expect(dialog).toBeHidden();
  await expect(page.getByText(/Certificados de estudio.*Recibido/u)).toBeVisible();
  expect(consoleErrors).toEqual([]);
});

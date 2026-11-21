import { E2E_API_URL } from './support/environment';
import { fulfillJson, mockApi } from './support/api-mock';
import { accessibilityViolations, expect, test } from './support/fixtures';

// SST desde el celular (B37, ficha 17.14: «cualquier colaborador reporta una condición insegura en
// menos de un minuto desde su celular»). Pantalla de 390 px, sin teclado físico ni mouse.

const reportId = '01999a00-0000-7000-8000-0000000b3790';
const year = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'America/Bogota',
  year: 'numeric',
}).format(new Date());
const compliance = {
  total: 0,
  done: 0,
  due_to_date: 0,
  done_of_due: 0,
  year_percent: 0,
  to_date_percent: 100,
};

test.use({ viewport: { width: 390, height: 844 }, hasTouch: true });

test('un colaborador reporta una condición insegura desde el celular en menos de un minuto', async ({
  page,
  consoleErrors,
}) => {
  let sent: unknown = null;
  await page.route(`${E2E_API_URL}/v1/sst/me/reports`, async (route) => {
    expect(route.request().method()).toBe('POST');
    expect(route.request().headers()['idempotency-key']).toBeTruthy();
    sent = route.request().postDataJSON();
    await fulfillJson(route, 201, {
      id: reportId,
      code: 'RPT-2026-0001',
      goes_to: 'unsafe_report',
    });
  });
  const started = Date.now();
  await page.goto('/app/mi-espacio/reportar');
  await expect(page.getByRole('heading', { name: 'Reportar a SST', level: 1 })).toBeVisible();
  expect(await accessibilityViolations(page)).toEqual([]);
  await page.getByLabel(/Condición insegura/u).check();
  await page.getByLabel('Qué pasa').fill('Hay un cable suelto atravesado en el pasillo.');
  await page.getByLabel('Dónde').fill('Pasillo del piso 3');
  await page.getByRole('button', { name: 'Enviar reporte' }).tap();
  await expect(page.getByText('RPT-2026-0001')).toBeVisible();
  expect(Date.now() - started).toBeLessThan(60_000);
  expect(sent).toMatchObject({ kind: 'unsafe_condition', location: 'Pasillo del piso 3' });
  const width = await page.evaluate(() => document.documentElement.scrollWidth);
  expect(width).toBeLessThanOrEqual(390);
  expect(consoleErrors).toEqual([]);
});

test('la portada de SST muestra los accidentes por reportar a la ARL', async ({
  page,
  consoleErrors,
}) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await mockApi(page, {
    '/v1/sst/work-plan': { body: { year: Number(year), compliance, data: [] } },
    [`/v1/sst/standards-assessments/${year}/score`]: {
      body: { year: Number(year), score: 0, rating: 'critical', assessed: 0, total: 60 },
    },
    '/v1/sst/incidents': {
      body: {
        data: [
          {
            id: reportId,
            code: 'SST-2026-0001',
            kind: 'accident',
            status: 'reported',
            occurred_at: '2026-11-18T14:00:00.000Z',
            location: 'Escalera',
            affected: 'self',
            affected_employee: null,
            reported_by: { id: reportId, name: 'Ana Prueba' },
            arl_due_on: '2026-11-20',
            arl_reported_on: null,
            arl_overdue: true,
            version: 1,
          },
        ],
      },
    },
  });
  await page.goto('/app/talento-y-sst/sst');
  await expect(
    page.getByRole('heading', { name: 'Seguridad y salud en el trabajo', level: 1 }),
  ).toBeVisible();
  await expect(page.getByText('Hay plazos vencidos')).toBeVisible();
  expect(await accessibilityViolations(page)).toEqual([]);
  expect(consoleErrors).toEqual([]);
});

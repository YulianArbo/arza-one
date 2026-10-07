import { apiError, DEGRADED, HEALTHY, mockApi, VERSION } from './support/api-mock';
import { expect, test } from './support/fixtures';

// La pantalla de ejemplo resuelve los estados del numeral 16.5 con la API simulada.

test('muestra la versión y que todas las piezas responden', async ({ page, consoleErrors }) => {
  await mockApi(page, { '/version': { body: VERSION }, '/health': { body: HEALTHY } });
  await page.goto('/app/estado-del-sistema');
  await expect(page.getByText('Todo funciona')).toBeVisible();
  await expect(page.getByText('e2e0001')).toBeVisible();
  await expect(page.getByText('Responde', { exact: true })).toHaveCount(3);
  expect(consoleErrors).toEqual([]);
});

test('avisa con texto cuando una pieza no responde', async ({ page }) => {
  await mockApi(page, {
    '/version': { body: VERSION },
    '/health': { status: 503, body: DEGRADED },
  });
  await page.goto('/app/estado-del-sistema');
  await expect(page.getByText('Hay piezas que no responden')).toBeVisible();
  await expect(page.getByRole('row', { name: /Colas y caché.*No responde/ })).toBeVisible();
});

test('un error del servidor da el código para soporte y se puede reintentar', async ({ page }) => {
  let failing = true;
  await mockApi(page, {
    '/version': () =>
      failing
        ? { status: 500, body: apiError('INTERNAL_ERROR', 'Ocurrió un error.', 'corr-500') }
        : { body: VERSION },
    '/health': { body: HEALTHY },
  });
  await page.goto('/app/estado-del-sistema');
  const alert = page.getByRole('main').getByRole('alert');
  await expect(alert).toContainText('No pudimos cargar la información');
  await expect(alert).toContainText('corr-500');

  failing = false;
  await alert.getByRole('button', { name: 'Reintentar' }).click();
  await expect(page.getByText('Todo funciona')).toBeVisible();
});

test('sin permiso explica a quién pedir acceso y no muestra datos', async ({ page }) => {
  await mockApi(page, {
    '/version': { status: 403, body: apiError('FORBIDDEN', 'Sin permiso.', 'corr-403') },
    '/health': { body: HEALTHY },
  });
  await page.goto('/app/estado-del-sistema');
  await expect(page.getByRole('main').getByRole('alert')).toContainText(
    'No tiene acceso a esta sección',
  );
  await expect(page.getByText('e2e0001')).toBeHidden();
  await expect(page.getByRole('cell', { name: 'Base de datos' })).toBeHidden();
});

test('sin conexión con la API lo dice en español', async ({ page }) => {
  await mockApi(page, { '/version': 'offline', '/health': 'offline' });
  await page.goto('/app/estado-del-sistema');
  await expect(page.getByRole('main').getByRole('alert')).toContainText(
    'No pudimos comunicarnos con el servidor',
  );
});

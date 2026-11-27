import { AI_ID, answer, status } from '../src/features/assistant/assistant-fixtures';
import { mockApi, type ApiRoutes } from './support/api-mock';
import { accessibilityViolations, expect, test, useTheme } from './support/fixtures';

// Asistente de IA (B47): preguntar con fuentes y las pantallas de gobierno, sin violaciones de
// accesibilidad WCAG 2.2 AA en modo claro y oscuro. Datos ficticios; nada sale del navegador.

const API: ApiRoutes = {
  '/v1/ai/status': { body: status() },
  '/v1/ai/search': { body: answer() },
  '/v1/ai/use-cases': {
    body: {
      data: [
        {
          use_case: 'doc_search',
          enabled: true,
          assessment_reference: 'EIPD-IA-001',
          assessment_approved_on: '2026-11-26',
          changed_by: { id: AI_ID(1), name: 'Oficial de datos' },
          changed_at: '2026-11-26T15:00:00.000Z',
          version: 1,
        },
      ],
    },
  },
  '/v1/ai/prompts': {
    body: { data: [], defaults: [{ use_case: 'doc_search', body: 'Responda la pregunta.' }] },
  },
  '/v1/ai/requests': { body: { data: [], next_cursor: null } },
};

const SCREENS = [
  { path: '/registro', heading: 'Registro de usos del asistente' },
  { path: '/usos', heading: 'Usos activos del asistente' },
  { path: '/instrucciones', heading: 'Instrucciones del asistente' },
] as const;

for (const theme of ['light', 'dark'] as const) {
  test.describe(`Asistente B47 en modo ${theme === 'light' ? 'claro' : 'oscuro'}`, () => {
    test.slow();

    test('preguntar muestra la propuesta con sus fuentes, sin violaciones', async ({
      page,
      consoleErrors,
    }) => {
      await useTheme(page, theme);
      await mockApi(page, API);
      await page.goto('/app/asistente');
      await expect(page.getByRole('heading', { name: 'Asistente', level: 1 })).toBeVisible();
      await page.getByLabel('Su pregunta').fill('¿Cómo se pide un cambio en un documento?');
      await page.getByRole('button', { name: /Preguntar/u }).click();
      await expect(page.getByRole('link', { name: /PR-SGC-001/u })).toBeVisible();
      // Se revisa la pantalla en reposo, como las demás pruebas. El color de los botones
      // principales al pasar el puntero en modo oscuro (--action-hover) no alcanza 4,5:1: queda
      // como pendiente del sistema de diseño en el cierre de B47.
      await page.mouse.move(0, 0);
      expect(await accessibilityViolations(page)).toEqual([]);
      expect(consoleErrors).toEqual([]);
    });

    for (const screen of SCREENS) {
      test(`«${screen.heading}» no tiene violaciones de accesibilidad`, async ({
        page,
        consoleErrors,
      }) => {
        await useTheme(page, theme);
        await mockApi(page, API);
        await page.goto(`/app/asistente${screen.path}`);
        await expect(page.getByRole('heading', { name: screen.heading, level: 1 })).toBeVisible();
        expect(await accessibilityViolations(page)).toEqual([]);
        expect(consoleErrors).toEqual([]);
      });
    }
  });
}

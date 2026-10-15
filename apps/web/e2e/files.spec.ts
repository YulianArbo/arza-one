import { mockApi, mockPermissions, type ApiRoutes } from './support/api-mock';
import { accessibilityViolations, expect, test, useTheme } from './support/fixtures';

// Pantalla de archivos de B14: accesibilidad WCAG 2.2 AA en modo claro y oscuro, los estados del
// análisis, una carga rechazada en la pantalla y quien no tiene permiso.

const FILE = {
  id: '01999a00-0000-7000-8000-00000000d001',
  file_name: 'Acta de visita.pdf',
  mime_type: 'application/pdf',
  size_bytes: 524_288,
  sha256: 'b'.repeat(64),
  status: 'available',
  rejection: null,
  created_at: '2026-10-15T15:00:00.000Z',
};

const FILES_API: ApiRoutes = {
  '/v1/files': {
    body: {
      data: [
        FILE,
        {
          ...FILE,
          id: '01999a00-0000-7000-8000-00000000d002',
          file_name: 'eicar.pdf',
          sha256: null,
          status: 'rejected',
          rejection: 'virus',
        },
        {
          ...FILE,
          id: '01999a00-0000-7000-8000-00000000d003',
          file_name: 'Foto.png',
          mime_type: 'image/png',
          sha256: null,
          status: 'scanning',
        },
      ],
    },
  },
};

for (const theme of ['light', 'dark'] as const) {
  test.describe(`archivos en modo ${theme === 'light' ? 'claro' : 'oscuro'}`, () => {
    // Mismo margen que terceros (B13): equipo con poca memoria y servidor recién encendido.
    test.slow();
    test('/app/archivos no tiene violaciones de accesibilidad', async ({ page, consoleErrors }) => {
      await useTheme(page, theme);
      await mockApi(page, FILES_API);
      await page.goto('/app/archivos');
      await expect(page.getByText('El antivirus encontró un virus')).toBeVisible();
      await expect(page.getByText('En análisis')).toBeVisible();
      expect(await accessibilityViolations(page)).toEqual([]);
      expect(consoleErrors).toEqual([]);
    });
  });
}

test.describe('carga de archivos', () => {
  test('un tipo fuera de la lista blanca no se envía', async ({ page }) => {
    await mockApi(page, FILES_API);
    await page.goto('/app/archivos');
    await page.getByLabel('Elija un archivo o arrástrelo aquí').setInputFiles({
      name: 'programa.exe',
      mimeType: 'application/x-msdownload',
      buffer: Buffer.from('MZ'),
    });
    await expect(page.getByText(/Ese tipo de archivo no está permitido/)).toBeVisible();
    await expect(page.getByRole('button', { name: 'Subir archivo' })).toBeDisabled();
  });
});

test.describe('quien no ve documentos', () => {
  test('ve «Sin permiso» si escribe la dirección', async ({ page }) => {
    await mockPermissions(page, { roles: [], permissions: [] });
    await mockApi(page, FILES_API);
    await page.goto('/app/archivos');
    await expect(page.getByText('No tiene acceso a esta sección')).toBeVisible();
  });
});

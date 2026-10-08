import { defineConfig } from 'vitest/config';

// Pruebas unitarias de la lógica de la web. Las pantallas completas se prueban en el navegador
// con Playwright (e2e/), donde también se mide la accesibilidad con axe-core.
export default defineConfig({
  test: {
    environment: 'jsdom',
    include: ['src/**/*.test.{ts,tsx}'],
    setupFiles: ['src/test-setup.ts'],
    // Mismo tiempo máximo que la API y el worker: las pantallas con formularios simulan la
    // escritura y, en equipos lentos, la primera prueba de cada archivo carga los componentes.
    testTimeout: 20_000,
    coverage: {
      provider: 'v8',
      include: [
        'src/lib/**/*.{ts,tsx}',
        'src/features/**/*.{ts,tsx}',
        'src/components/app-shell/navigation.ts',
      ],
      exclude: ['src/**/*.test.{ts,tsx}'],
      // Umbral del capítulo 21.1.
      thresholds: { lines: 90, functions: 90, statements: 90, branches: 85 },
    },
  },
});

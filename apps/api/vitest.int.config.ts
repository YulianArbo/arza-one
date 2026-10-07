import { defineConfig } from 'vitest/config';

// Pruebas de integración con PostgreSQL real (capítulo 11.4, paso 5). Requieren Docker.
export default defineConfig({
  test: {
    include: ['test/int/**/*.int.test.ts'],
    globalSetup: ['test/int/support/global-setup.ts'],
    testTimeout: 30_000,
    hookTimeout: 180_000,
    coverage: {
      provider: 'v8',
      reportsDirectory: 'coverage/int',
      // Lo que solo puede probarse contra la base de datos real. seed-main.ts solo arranca el proceso.
      include: ['src/platform/database/**/*.ts'],
      exclude: ['src/**/*.test.ts', 'src/platform/database/seed/seed-main.ts'],
      // Umbral del capítulo 21.1.
      thresholds: { lines: 90, functions: 90, statements: 90, branches: 85 },
    },
  },
});

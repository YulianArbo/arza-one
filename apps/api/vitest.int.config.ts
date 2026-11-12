import { defineConfig } from 'vitest/config';

import { DATABASE_BOUND_FILES, ENTRY_POINTS } from './vitest.shared.js';

// Pruebas de integración con PostgreSQL y Valkey reales (capítulo 11.4, paso 5). Requieren Docker.
export default defineConfig({
  test: {
    include: ['test/int/**/*.int.test.ts'],
    globalSetup: ['test/int/support/global-setup.ts'],
    setupFiles: ['test/int/support/database-teardown.ts'],
    testTimeout: 150_000,
    // Cada archivo abre sus propias conexiones a la misma base: con más de cuatro a la vez, en un
    // equipo de ocho núcleos las transacciones de preparación esperan más de lo permitido (B16).
    maxWorkers: 4,
    // Sin aislar cada archivo: comparten los módulos ya cargados (ninguna prueba cambia globales).
    isolate: false,
    hookTimeout: 300_000,
    coverage: {
      provider: 'v8',
      reportsDirectory: 'coverage/int',
      // Lo que solo puede probarse contra la base de datos y Valkey reales (vitest.shared.ts).
      include: DATABASE_BOUND_FILES,
      exclude: ['src/**/*.test.ts', ...ENTRY_POINTS],
      // Umbral del capítulo 21.1.
      thresholds: { lines: 90, functions: 90, statements: 90, branches: 85 },
    },
  },
});

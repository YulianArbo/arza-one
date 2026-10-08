import { defineConfig } from 'vitest/config';

import { DATABASE_BOUND_FILES, ENTRY_POINTS } from './vitest.shared.js';

export default defineConfig({
  test: {
    include: ['src/**/*.test.ts', 'test/**/*.test.ts'],
    // Las pruebas con base de datos real tienen su propia configuración (vitest.int.config.ts).
    exclude: ['test/int/**'],
    testTimeout: 20_000,
    coverage: {
      provider: 'v8',
      include: ['src/**/*.ts'],
      // Lo que trabaja contra PostgreSQL o Valkey se mide en vitest.int.config.ts con el mismo
      // umbral (vitest.shared.ts). main.ts solo arranca el proceso; test/startup.test.ts lo prueba
      // como proceso real. El cliente de Prisma es código generado. index.ts solo reexporta.
      exclude: [
        'src/**/*.test.ts',
        ...ENTRY_POINTS,
        ...DATABASE_BOUND_FILES,
        'src/platform/index.ts',
        'src/modules/*/index.ts',
        'src/generated/**',
      ],
      // Umbral del capítulo 21.1.
      thresholds: { lines: 90, functions: 90, statements: 90, branches: 85 },
    },
  },
});

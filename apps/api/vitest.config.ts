import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['src/**/*.test.ts', 'test/**/*.test.ts'],
    // Las pruebas con base de datos real tienen su propia configuración (vitest.int.config.ts).
    exclude: ['test/int/**'],
    testTimeout: 20_000,
    coverage: {
      provider: 'v8',
      include: ['src/**/*.ts'],
      // main.ts solo arranca el proceso; test/startup.test.ts lo prueba como proceso real.
      // Los datos semilla solo se prueban contra PostgreSQL real: su cobertura la mide
      // vitest.int.config.ts con el mismo umbral, igual que el conteo en Valkey y las colas (B06).
      // El cliente de Prisma es código generado. index.ts solo reexporta.
      exclude: [
        'src/**/*.test.ts',
        'src/main.ts',
        'src/platform/database/seed/**',
        'src/platform/valkey/valkey-throttler-storage.ts',
        'src/platform/queues/job-queue.ts',
        'src/platform/index.ts',
        'src/generated/**',
      ],
      // Umbral del capítulo 21.1.
      thresholds: { lines: 90, functions: 90, statements: 90, branches: 85 },
    },
  },
});

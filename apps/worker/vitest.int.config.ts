import { defineConfig } from 'vitest/config';

// Pruebas del worker con PostgreSQL, Valkey y Mailpit reales en Docker (capítulo 11.4, paso 5).
// La base de datos y Valkey se preparan con el mismo guion que las pruebas de la API.
export default defineConfig({
  test: {
    include: ['test/int/**/*.int.test.ts'],
    globalSetup: [
      '../api/test/int/support/global-setup.ts',
      'test/int/support/mailpit-setup.ts',
      'test/int/support/gotenberg-setup.ts',
    ],
    testTimeout: 60_000,
    hookTimeout: 180_000,
    // Los archivos comparten las colas de Valkey: se ejecutan uno tras otro.
    fileParallelism: false,
    coverage: {
      provider: 'v8',
      reportsDirectory: 'coverage/int',
      include: ['src/worker.module.ts', 'src/queue/queue-workers.ts'],
      thresholds: { lines: 90, functions: 90, statements: 90, branches: 85 },
    },
  },
});

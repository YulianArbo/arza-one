import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['src/**/*.test.ts'],
    testTimeout: 20_000,
    coverage: {
      provider: 'v8',
      include: ['src/**/*.ts'],
      // main.ts, healthcheck.ts y el comando de ejemplo solo arrancan procesos. worker.module.ts y
      // queue-workers.ts conectan con Valkey y PostgreSQL reales: su cobertura la mide
      // vitest.int.config.ts, con el mismo umbral.
      exclude: [
        'src/**/*.test.ts',
        'src/main.ts',
        'src/healthcheck.ts',
        'src/cli/**',
        'src/worker.module.ts',
        'src/queue/queue-workers.ts',
      ],
      // Umbral del capítulo 21.1.
      thresholds: { lines: 90, functions: 90, statements: 90, branches: 85 },
    },
  },
});

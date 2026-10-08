import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['ci/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      include: ['ci/**/*.ts'],
      // Los puntos de entrada solo leen los argumentos y llaman a la lógica, que sí se prueba.
      exclude: ['ci/**/*.test.ts', 'ci/check-migrations.ts', 'ci/check-vulnerabilities.ts'],
      // Umbral del capítulo 21.1.
      thresholds: { lines: 90, functions: 90, statements: 90, branches: 85 },
    },
  },
});

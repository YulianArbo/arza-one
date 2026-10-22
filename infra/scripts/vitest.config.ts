import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['ci/**/*.test.ts', 'local/**/*.test.ts', 'deploy/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      include: ['ci/**/*.ts', 'local/**/*.ts', 'deploy/**/*.ts'],
      // Los puntos de entrada solo leen los argumentos y llaman a la lógica, que sí se prueba.
      // Lo mismo con la conexión de los guiones locales con Docker y pnpm (node-runner.ts).
      exclude: [
        '**/*.test.ts',
        'ci/check-migrations.ts',
        'ci/check-vulnerabilities.ts',
        'ci/plan-ci.ts',
        'local/dev-watch.ts',
        'local/env-local.ts',
        'local/infra.ts',
        'local/node-runner.ts',
        // Despliegue (B07): igual, los puntos de entrada y la conexión con ssh, bash y tar. El
        // ensayo de GitHub los ejecuta de verdad contra un servidor simulado.
        'deploy/check-ports.ts',
        'deploy/deploy-main.ts',
        'deploy/deploy-runner.ts',
      ],
      // Umbral del capítulo 21.1.
      thresholds: { lines: 90, functions: 90, statements: 90, branches: 85 },
    },
  },
});

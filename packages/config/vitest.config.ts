import { defineConfig } from 'vitest/config';

// Las pruebas de los controles ejecutan herramientas externas (git, gitleaks, dependency-cruiser).
export default defineConfig({
  test: { testTimeout: 60_000 },
});

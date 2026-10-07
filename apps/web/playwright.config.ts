import { defineConfig, devices } from '@playwright/test';

import { E2E_API_URL, E2E_PORT, E2E_WEB_URL } from './e2e/support/environment';

// Pruebas en navegador (capítulo 21): recorren la web construida para producción.
// La API se simula en cada prueba; por eso no hace falta levantarla ni tener datos.
export default defineConfig({
  testDir: 'e2e',
  fullyParallel: true,
  forbidOnly: Boolean(process.env['CI']),
  retries: 0,
  reporter: [['list']],
  timeout: 30_000,
  use: {
    baseURL: E2E_WEB_URL,
    locale: 'es-CO',
    timezoneId: 'America/Bogota',
    trace: 'retain-on-failure',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: {
    command: `pnpm exec next start --port ${String(E2E_PORT)}`,
    url: E2E_WEB_URL,
    reuseExistingServer: false,
    timeout: 120_000,
    env: { API_URL: E2E_API_URL, APP_ENV: 'local', NEXT_TELEMETRY_DISABLED: '1' },
  },
});

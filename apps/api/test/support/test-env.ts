// Variables ficticias para las pruebas. Ningún valor es real (CLAUDE.md: nunca datos reales).
const TEST_ENV: Record<string, string> = {
  NODE_ENV: 'test',
  APP_ENV: 'local',
  APP_URL: 'http://localhost:3000',
  PORTAL_URL: 'http://localhost:3000/portal',
  PUBLIC_URL: 'http://localhost:3000',
  API_URL: 'http://localhost:4000',
  LOG_LEVEL: 'fatal',
  DATABASE_URL: 'postgresql://app_user:ficticia@127.0.0.1:1/arza_one',
  DATABASE_CONNECT_TIMEOUT_MS: '30000',
  DATABASE_TRANSACTION_MAX_WAIT_MS: '60000',
  DATABASE_TRANSACTION_TIMEOUT_MS: '120000',
  VALKEY_URL: 'redis://127.0.0.1:1',
  S3_ENDPOINT: 'http://127.0.0.1:1',
  S3_REGION: 'garage',
  S3_BUCKET: 'arza-one-test',
  S3_ACCESS_KEY: 'ficticia',
  S3_SECRET_KEY: 'ficticia',
  RATE_LIMIT_WINDOW_SECONDS: '60',
  RATE_LIMIT_MAX_REQUESTS: '100',
  CSRF_SECRET: 'ficticia-ficticia-ficticia-ficticia',
  FIELD_ENCRYPTION_KEY: 'ficticia-cifrado-ficticia-cifrado-ficticia',
};

/** Entorno de prueba completo; cada prueba puede quitar (undefined) o cambiar variables. */
export function testEnv(
  overrides: Record<string, string | undefined> = {},
): Record<string, string | undefined> {
  return { ...TEST_ENV, ...overrides };
}

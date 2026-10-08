// Prueba de humo del aislamiento entre empresas en la base desplegada (B07, ADR-007).
// Con las dos empresas ficticias (Demo Uno y Demo Dos), el usuario de la API (app_user):
//   - no es superusuario ni puede saltarse la seguridad por fila;
//   - sin empresa en contexto no ve ninguna;
//   - con la empresa A en contexto ve solo la A y no encuentra la B.
// No escribe nada. Las contraseñas se leen dentro del contenedor, nunca salen del servidor.
import { compose } from './release.ts';
import { DeployError, required, shellQuote, type Remote } from './remote.ts';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

/** psql dentro del contenedor de PostgreSQL. `asApp` entra como app_user, igual que la API. */
function psql(baseDir: string, version: string, sql: string, asApp: boolean): string {
  const login = asApp
    ? 'PGPASSWORD="$APP_DB_PASSWORD" psql --host 127.0.0.1 --username app_user'
    : 'psql --username postgres';
  const command = `${login} --dbname arza_one --no-psqlrc --tuples-only --no-align --set ON_ERROR_STOP=1 --command ${shellQuote(sql)}`;
  return compose(baseDir, version, 'exec -T postgres sh -c', shellQuote(command));
}

function tenantIds(remote: Remote, baseDir: string, version: string): [string, string] {
  const sql = 'SELECT id FROM core_tenants ORDER BY id LIMIT 2';
  const output = required(
    remote,
    'leer las empresas ficticias',
    psql(baseDir, version, sql, false),
  );
  const ids = output.stdout.split(/\r?\n/).map((line) => line.trim());
  const [first, second] = ids.filter((id) => UUID.test(id));
  if (first === undefined || second === undefined) {
    throw new DeployError('Aislamiento: se esperaban al menos dos empresas ficticias.');
  }
  return [first, second];
}

/** Devuelve el problema encontrado, o undefined si el aislamiento se cumple. */
export function checkIsolation(
  remote: Remote,
  baseDir: string,
  version: string,
): string | undefined {
  const [tenantA, tenantB] = tenantIds(remote, baseDir, version);
  const sql = [
    "SELECT 'role=' || rolsuper || ',' || rolbypassrls FROM pg_roles WHERE rolname = current_user;",
    "SELECT 'none=' || count(*) FROM core_tenants;",
    `SELECT set_config('app.tenant_id', '${tenantA}', false);`,
    "SELECT 'own=' || count(*) FROM core_tenants;",
    `SELECT 'other=' || count(*) FROM core_tenants WHERE id = '${tenantB}';`,
  ].join(' ');
  const output = required(remote, 'revisar el aislamiento', psql(baseDir, version, sql, true));
  const expected = ['role=false,false', 'none=0', 'own=1', 'other=0'];
  const lines = new Set(output.stdout.split(/\r?\n/).map((line) => line.trim()));
  const missing = expected.filter((line) => !lines.has(line));
  return missing.length === 0
    ? undefined
    : `el usuario de la API no cumple el aislamiento (${missing.join(', ')} no se cumplió)`;
}

// Prueba de humo del aislamiento entre empresas en la base desplegada (B07, ADR-007).
// El usuario de la API (app_user):
//   - no es superusuario ni puede saltarse la seguridad por fila;
//   - sin empresa en contexto no ve ninguna;
//   - con la empresa A en contexto ve solo la A y no encuentra la B.
// En pruebas siempre hay dos empresas ficticias (Demo Uno y Demo Dos). En producción, mientras
// haya una sola empresa, se revisan los dos primeros puntos y que vea solo la suya (B44).
// No escribe nada. Las contraseñas se leen dentro del contenedor, nunca salen del servidor.
import { compose, type Target } from './release.ts';
import { DeployError, required, shellQuote, type Remote } from './remote.ts';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

/** psql dentro del contenedor de PostgreSQL. `asApp` entra como app_user, igual que la API. */
function psql(target: Target, version: string, sql: string, asApp: boolean): string {
  const login = asApp
    ? 'PGPASSWORD="$APP_DB_PASSWORD" psql --host 127.0.0.1 --username app_user'
    : 'psql --username postgres';
  const command = `${login} --dbname arza_one --no-psqlrc --tuples-only --no-align --set ON_ERROR_STOP=1 --command ${shellQuote(sql)}`;
  return compose(target, version, 'exec -T postgres sh -c', shellQuote(command));
}

function tenantIds(remote: Remote, target: Target, version: string): [string, string?] {
  const sql = 'SELECT id FROM core_tenants ORDER BY id LIMIT 2';
  const output = required(remote, 'leer las empresas', psql(target, version, sql, false));
  const ids = output.stdout.split(/\r?\n/).map((line) => line.trim());
  const [first, second] = ids.filter((id) => UUID.test(id));
  if (first === undefined || (second === undefined && target.environment === 'staging')) {
    throw new DeployError('Aislamiento: se esperaban al menos dos empresas ficticias.');
  }
  return second === undefined ? [first] : [first, second];
}

/** Consultas y líneas esperadas; con una sola empresa no hay «otra» que buscar. */
export function isolationQueries(tenantA: string, tenantB?: string): [string, string[]] {
  const sql = [
    "SELECT 'role=' || rolsuper || ',' || rolbypassrls FROM pg_roles WHERE rolname = current_user;",
    "SELECT 'none=' || count(*) FROM core_tenants;",
    `SELECT set_config('app.tenant_id', '${tenantA}', false);`,
    "SELECT 'own=' || count(*) FROM core_tenants;",
  ];
  const expected = ['role=false,false', 'none=0', 'own=1'];
  if (tenantB !== undefined) {
    sql.push(`SELECT 'other=' || count(*) FROM core_tenants WHERE id = '${tenantB}';`);
    expected.push('other=0');
  }
  return [sql.join(' '), expected];
}

/** Devuelve el problema encontrado, o undefined si el aislamiento se cumple. */
export function checkIsolation(
  remote: Remote,
  target: Target,
  version: string,
): string | undefined {
  const [tenantA, tenantB] = tenantIds(remote, target, version);
  const [sql, expected] = isolationQueries(tenantA, tenantB);
  const output = required(remote, 'revisar el aislamiento', psql(target, version, sql, true));
  const lines = new Set(output.stdout.split(/\r?\n/).map((line) => line.trim()));
  const missing = expected.filter((line) => !lines.has(line));
  return missing.length === 0
    ? undefined
    : `el usuario de la API no cumple el aislamiento (${missing.join(', ')} no se cumplió)`;
}

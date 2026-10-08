// Genera el archivo .env del entorno local a partir de .env.example (bloque B06).
// Cada valor «REEMPLAZAR» recibe un secreto al azar, válido solo en este equipo.

export const PLACEHOLDER = 'REEMPLAZAR';

/** Fuente de bytes al azar; en las pruebas se reemplaza por una predecible. */
export type RandomBytes = (size: number) => Buffer;

type SecretFormat = (random: RandomBytes) => string;

const hex =
  (bytes: number): SecretFormat =>
  (random) =>
    random(bytes).toString('hex');

const DEFAULT_SECRET: SecretFormat = (random) => random(32).toString('base64url');

/**
 * Formatos que exige cada pieza. Garage solo acepta llaves de acceso «GK» + 24 hexadecimales,
 * secretos de 64 hexadecimales y un secreto de red de 32 bytes en hexadecimal.
 */
const SECRET_FORMATS: Readonly<Record<string, SecretFormat>> = {
  S3_ACCESS_KEY: (random) => `GK${hex(12)(random)}`,
  S3_SECRET_KEY: hex(32),
  GARAGE_RPC_SECRET: hex(32),
  // Las contraseñas van dentro de direcciones (postgresql://, redis://): solo hexadecimales.
  POSTGRES_PASSWORD: hex(24),
  APP_DB_PASSWORD: hex(24),
  MIGRATION_DB_PASSWORD: hex(24),
  VALKEY_PASSWORD: hex(24),
};

/** Direcciones que llevan dentro la contraseña de otra variable. */
const PASSWORD_SOURCES: Readonly<Record<string, string>> = {
  DATABASE_URL: 'APP_DB_PASSWORD',
  DATABASE_MIGRATION_URL: 'MIGRATION_DB_PASSWORD',
  VALKEY_URL: 'VALKEY_PASSWORD',
};

const ASSIGNMENT = /^([A-Z][A-Z0-9_]*)=(.*)$/;

interface Assignment {
  readonly name: string;
  readonly value: string;
}

function parseAssignment(line: string): Assignment | undefined {
  const match = ASSIGNMENT.exec(line);
  return match ? { name: match[1] ?? '', value: match[2] ?? '' } : undefined;
}

function secretFor(name: string, random: RandomBytes): string {
  return (SECRET_FORMATS[name] ?? DEFAULT_SECRET)(random);
}

/** Reemplaza cada «REEMPLAZAR» de la plantilla y devuelve el contenido del nuevo .env. */
export function generateEnv(template: string, random: RandomBytes): string {
  const lines = template.split('\n');
  const secrets = new Map<string, string>();
  for (const line of lines) {
    const assignment = parseAssignment(line);
    if (assignment?.value === PLACEHOLDER) {
      secrets.set(assignment.name, secretFor(assignment.name, random));
    }
  }
  return lines.map((line) => fillLine(line, secrets)).join('\n');
}

function fillLine(line: string, secrets: ReadonlyMap<string, string>): string {
  const assignment = parseAssignment(line);
  if (assignment?.value.includes(PLACEHOLDER) !== true) return line;
  const { name, value } = assignment;
  const source = PASSWORD_SOURCES[name] ?? name;
  const secret = secrets.get(source);
  if (secret === undefined) {
    throw new Error(`${name} usa la contraseña de ${source}, que no está en la plantilla.`);
  }
  return `${name}=${value.replace(PLACEHOLDER, secret)}`;
}

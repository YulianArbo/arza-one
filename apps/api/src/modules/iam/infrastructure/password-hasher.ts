import { argon2, randomBytes, timingSafeEqual } from 'node:crypto';

// Contraseñas con Argon2id (ADR-008), con la implementación que trae Node.js: sin dependencias.
// Parámetros mínimos recomendados por OWASP: 19 MiB de memoria, 2 pasadas, 1 hilo. Se guardan en
// el formato estándar PHC ($argon2id$v=19$m=…,t=…,p=…$sal$hash), así un cambio futuro de
// parámetros no invalida las contraseñas existentes.

interface Argon2Parameters {
  readonly memory: number;
  readonly passes: number;
  readonly parallelism: number;
}

const CURRENT: Argon2Parameters = { memory: 19_456, passes: 2, parallelism: 1 };
const SALT_BYTES = 16;
const TAG_BYTES = 32;
const ARGON2_VERSION = 19;
const PHC_PATTERN =
  /^\$argon2id\$v=19\$m=(\d+),t=(\d+),p=(\d+)\$([A-Za-z0-9+/]+)\$([A-Za-z0-9+/]+)$/;

function derive(password: string, salt: Buffer, parameters: Argon2Parameters, tagLength: number) {
  return new Promise<Buffer>((resolve, reject) => {
    argon2(
      'argon2id',
      { message: password, nonce: salt, tagLength, ...parameters },
      (error, key) => {
        if (error) reject(error);
        else resolve(key);
      },
    );
  });
}

function unpadded(buffer: Buffer): string {
  return buffer.toString('base64').replace(/=+$/, '');
}

/** Huella Argon2id con sal aleatoria propia, en formato PHC. */
export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(SALT_BYTES);
  const tag = await derive(password, salt, CURRENT, TAG_BYTES);
  const { memory, passes, parallelism } = CURRENT;
  return `$argon2id$v=${String(ARGON2_VERSION)}$m=${String(memory)},t=${String(passes)},p=${String(parallelism)}$${unpadded(salt)}$${unpadded(tag)}`;
}

/**
 * Compara en tiempo constante. Una huella con formato o parámetros que Argon2 no acepta nunca
 * coincide.
 */
export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const match = PHC_PATTERN.exec(stored);
  if (match === null) return false;
  const part = (index: number): string => match[index] ?? '';
  const expected = Buffer.from(part(5), 'base64');
  const parameters = {
    memory: Number(part(1)),
    passes: Number(part(2)),
    parallelism: Number(part(3)),
  };
  try {
    const actual = await derive(
      password,
      Buffer.from(part(4), 'base64'),
      parameters,
      expected.length,
    );
    return timingSafeEqual(actual, expected);
  } catch {
    return false;
  }
}

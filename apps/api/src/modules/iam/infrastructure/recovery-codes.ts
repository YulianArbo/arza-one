import { createHash, randomInt } from 'node:crypto';

// Códigos de recuperación (numeral 15.1): diez, de un solo uso, para entrar sin el celular. Cada
// uno tiene 16 caracteres al azar (unos 79 bits) de un alfabeto sin letras que se confunden (I, L,
// O, 0 y 1). Se muestran una sola vez; en la base de datos queda solo su huella SHA-256.

const ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
const LENGTH = 16;
const GROUP = 4;
const VALID = new RegExp(`^[${ALPHABET}]{${String(LENGTH)}}$`);

function randomCode(): string {
  return Array.from({ length: LENGTH }, () => ALPHABET[randomInt(ALPHABET.length)]).join('');
}

/** En grupos de cuatro para leerlo y copiarlo con facilidad: «ABCD-EFGH-JKMN-PQRS». */
function formatted(code: string): string {
  return code.match(new RegExp(`.{${String(GROUP)}}`, 'g'))?.join('-') ?? code;
}

export function newRecoveryCodes(count: number): string[] {
  return Array.from({ length: count }, () => formatted(randomCode()));
}

/**
 * Lo que la persona escribe, sin guiones ni espacios y en mayúsculas. Null si no tiene la forma
 * de un código: así no se consulta la base de datos en vano.
 */
export function normalizeRecoveryCode(input: string): string | null {
  const code = input.toUpperCase().replace(/[\s-]/g, '');
  return VALID.test(code) ? code : null;
}

export function hashRecoveryCode(code: string): string {
  const normalized = normalizeRecoveryCode(code) ?? code;
  return createHash('sha256').update(`recovery:${normalized}`).digest('hex');
}

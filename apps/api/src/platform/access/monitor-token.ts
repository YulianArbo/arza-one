import { createHash, timingSafeEqual } from 'node:crypto';

const BEARER = /^Bearer (\S+)$/;

function digest(value: string): Buffer {
  return createHash('sha256').update(value).digest();
}

/**
 * ¿La cabecera Authorization trae la llave de los vigilantes? Compara en tiempo constante (las
 * huellas tienen siempre el mismo largo). Sin llave configurada, nunca.
 */
export function monitorTokenMatches(
  authorization: string | undefined,
  expected: string | undefined,
): boolean {
  if (expected === undefined || authorization === undefined) return false;
  const received = BEARER.exec(authorization)?.[1];
  if (received === undefined) return false;
  return timingSafeEqual(digest(received), digest(expected));
}

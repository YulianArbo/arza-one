import { createHash, createHmac, randomBytes } from 'node:crypto';

// Llaves de sesión y de enlaces (numeral 15.1): 256 bits al azar. En la base de datos se guarda
// solo su huella SHA-256: quien lea la base no puede usar una sesión ni un enlace.

const TOKEN_BYTES = 32;

export interface SecretToken {
  /** Lo que recibe la persona (cookie o enlace). Nunca se guarda ni se registra. */
  readonly token: string;
  readonly hash: string;
}

export function hashSecretToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

export function newSecretToken(): SecretToken {
  const token = randomBytes(TOKEN_BYTES).toString('base64url');
  return { token, hash: hashSecretToken(token) };
}

/** Código antifalsificación de una sesión: firma de su identificador con CSRF_SECRET. */
export function csrfTokenFor(sessionId: string, secret: string): string {
  return createHmac('sha256', secret).update(`csrf:${sessionId}`).digest('base64url');
}

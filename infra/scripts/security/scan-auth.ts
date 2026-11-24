import { createHmac } from 'node:crypto';

// Piezas del ingreso de la cuenta de análisis (B43): ZAP y k6 recorren la aplicación con una
// sesión de verdad, creada con el mismo camino que una persona (invitación, contraseña, segundo
// factor). Solo en la copia desechable de GitHub Actions y con datos ficticios.

const BASE32 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
const TOTP_STEP_SECONDS = 30;
const TOTP_DIGITS = 6;

function base32Decode(secret: string): Buffer {
  const clean = secret.replace(/=+$/, '').replace(/\s/g, '').toUpperCase();
  let bits = '';
  for (const char of clean) {
    const value = BASE32.indexOf(char);
    if (value < 0) throw new Error('El secreto del segundo factor no está en base32.');
    bits += value.toString(2).padStart(5, '0');
  }
  const bytes = bits.match(/.{8}/g) ?? [];
  return Buffer.from(bytes.map((byte) => Number.parseInt(byte, 2)));
}

/** Código de seis dígitos del segundo factor (RFC 6238, SHA-1, 30 segundos), como el celular. */
export function totpCode(secret: string | Buffer, at: Date): string {
  const key = typeof secret === 'string' ? base32Decode(secret) : secret;
  const counter = Buffer.alloc(8);
  counter.writeBigUInt64BE(BigInt(Math.floor(at.getTime() / 1000 / TOTP_STEP_SECONDS)));
  const digest = createHmac('sha1', key).update(counter).digest();
  const offset = (digest.at(-1) ?? 0) & 0x0f;
  const binary = digest.readUInt32BE(offset) & 0x7fffffff;
  return String(binary % 10 ** TOTP_DIGITS).padStart(TOTP_DIGITS, '0');
}

/** La llave del enlace de activación que llega en el correo de invitación. */
export function invitationToken(mailText: string): string {
  const match = /activar-cuenta#token=([\w-]{43})/.exec(mailText);
  if (match?.[1] === undefined) throw new Error('El correo no trae el enlace de activación.');
  return match[1];
}

/** «nombre=valor» de la cookie de sesión entre las cabeceras Set-Cookie de una respuesta. */
export function sessionCookie(setCookies: readonly string[], name: string): string | undefined {
  const found = setCookies.find((header) => header.startsWith(`${name}=`));
  return found?.split(';')[0];
}

type OpenApiDocument = { paths?: Record<string, unknown> } & Record<string, unknown>;

/**
 * Quita del OpenAPI las rutas que cerrarían o cambiarían la sesión del análisis (salir, cerrar
 * sesiones, cambiar contraseña o segundo factor): ZAP las ataca todas y perdería el ingreso.
 */
export function withoutSessionRoutes(
  document: OpenApiDocument,
  excluded: readonly RegExp[],
): OpenApiDocument {
  const paths = Object.entries(document.paths ?? {}).filter(
    ([path]) => !excluded.some((pattern) => pattern.test(path)),
  );
  return { ...document, paths: Object.fromEntries(paths) };
}

/** Rutas que el análisis no toca (las cubren las pruebas de integración de Identidad). */
export const SESSION_ROUTES: readonly RegExp[] = [
  /^\/v1\/auth\//,
  /^\/v1\/me\/(mfa|sessions|password)(\/|$)/,
];

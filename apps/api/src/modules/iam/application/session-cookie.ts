// Cookie de sesión (numeral 15.6): HttpOnly, Secure, SameSite=Lax y prefijo __Host- (solo la
// envía el mismo dominio, en toda ruta, por HTTPS). Los navegadores aceptan Secure también en
// http://localhost, así funciona igual en el equipo local.

export const SESSION_COOKIE = '__Host-arza_session';

/** Lee la llave de sesión de la cabecera Cookie, sin dependencias adicionales. */
export function sessionTokenFrom(cookieHeader: string | undefined): string | null {
  if (cookieHeader === undefined) return null;
  for (const part of cookieHeader.split(';')) {
    const separator = part.indexOf('=');
    if (separator === -1) continue;
    if (part.slice(0, separator).trim() === SESSION_COOKIE) {
      const value = part.slice(separator + 1).trim();
      return /^[\w-]{43}$/.test(value) ? value : null;
    }
  }
  return null;
}

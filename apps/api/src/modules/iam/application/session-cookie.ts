// Cookies de identidad (numeral 15.6): HttpOnly, Secure, SameSite=Lax y prefijo __Host- (solo la
// envía el mismo dominio, en toda ruta, por HTTPS). Los navegadores aceptan Secure también en
// http://localhost, así funciona igual en el equipo local.

export const SESSION_COOKIE = '__Host-arza_session';

/**
 * Marca aleatoria del navegador (B09): con ella se reconoce un equipo desde el que la persona ya
 * entró, para avisar cuando entra desde uno nuevo (numeral 15.5). No da acceso a nada.
 */
export const DEVICE_COOKIE = '__Host-arza_device';

/** Lee la llave de una cookie de la cabecera Cookie, sin dependencias adicionales. */
function cookieTokenFrom(cookieHeader: string | undefined, name: string): string | null {
  if (cookieHeader === undefined) return null;
  for (const part of cookieHeader.split(';')) {
    const separator = part.indexOf('=');
    if (separator === -1) continue;
    if (part.slice(0, separator).trim() === name) {
      const value = part.slice(separator + 1).trim();
      return /^[\w-]{43}$/.test(value) ? value : null;
    }
  }
  return null;
}

export function sessionTokenFrom(cookieHeader: string | undefined): string | null {
  return cookieTokenFrom(cookieHeader, SESSION_COOKIE);
}

export function deviceTokenFrom(cookieHeader: string | undefined): string | null {
  return cookieTokenFrom(cookieHeader, DEVICE_COOKIE);
}

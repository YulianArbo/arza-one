import { SetMetadata, type CustomDecorator } from '@nestjs/common';

export const ACCESS_KEY = 'arza:access';
export const RECENT_AUTHENTICATION_KEY = 'arza:recent-authentication';

/**
 * Cómo se accede a una ruta. Toda ruta debe declararlo; sin declaración queda cerrada.
 * - public: sin sesión.
 * - authenticated: sesión completa (con el segundo factor, si le corresponde).
 * - signing_in: también una sesión que solo verificó la contraseña (el segundo paso, B09).
 */
export type AccessRule = 'public' | 'authenticated' | 'signing_in';

/** Ruta abierta sin sesión, como /health. Úsela solo cuando el manual lo prevea. */
export function Public(): CustomDecorator {
  return SetMetadata(ACCESS_KEY, 'public' satisfies AccessRule);
}

/** Ruta que exige una sesión completa. Los permisos por rol se agregan en B10. */
export function Authenticated(): CustomDecorator {
  return SetMetadata(ACCESS_KEY, 'authenticated' satisfies AccessRule);
}

/**
 * Ruta del segundo paso del inicio de sesión: la atiende también una sesión a la que le falta el
 * segundo factor. Solo para escribir el código, configurarlo, ver la sesión y salir.
 */
export function SigningIn(): CustomDecorator {
  return SetMetadata(ACCESS_KEY, 'signing_in' satisfies AccessRule);
}

/**
 * Acción de alto riesgo (numeral 15.1): exige haber confirmado la identidad en los últimos 30
 * minutos. Si no, responde 403 REAUTHENTICATION_REQUIRED y la web pide contraseña y código.
 */
export function RecentAuthentication(): CustomDecorator {
  return SetMetadata(RECENT_AUTHENTICATION_KEY, true);
}

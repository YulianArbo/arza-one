import { applyDecorators, SetMetadata, type CustomDecorator } from '@nestjs/common';
import type { PermissionCode } from '@arza/contracts';

export const ACCESS_KEY = 'arza:access';
export const PERMISSION_KEY = 'arza:permission';
export const RECENT_AUTHENTICATION_KEY = 'arza:recent-authentication';

/**
 * Cómo se accede a una ruta. Toda ruta debe declararlo; sin declaración queda cerrada, y una
 * prueba falla si alguna no lo hace (B10).
 * - public: sin sesión.
 * - signing_in: también una sesión que solo verificó la contraseña (el segundo paso, B09).
 * - own_account: sesión completa, sobre la cuenta propia (Mi perfil, mis sesiones, mis permisos).
 * - permission: sesión completa y el permiso del anexo G que declara la ruta (B10).
 * - record: sesión completa; el permiso lo decide el módulo dueño del registro (B16).
 */
export type AccessRule = 'public' | 'signing_in' | 'own_account' | 'permission' | 'record';

/** Ruta abierta sin sesión, como /health. Úsela solo cuando el manual lo prevea. */
export function Public(): CustomDecorator {
  return SetMetadata(ACCESS_KEY, 'public' satisfies AccessRule);
}

/**
 * Ruta del segundo paso del inicio de sesión: la atiende también una sesión a la que le falta el
 * segundo factor. Solo para escribir el código, configurarlo, ver la sesión y salir.
 */
export function SigningIn(): CustomDecorator {
  return SetMetadata(ACCESS_KEY, 'signing_in' satisfies AccessRule);
}

/**
 * Ruta sobre la cuenta propia: toda persona con sesión completa puede ver y cambiar lo suyo
 * (numeral 15.3, «P» en M01), sin permiso del catálogo. Solo bajo /v1/me y /v1/auth.
 */
export function OwnAccount(): CustomDecorator {
  return SetMetadata(ACCESS_KEY, 'own_account' satisfies AccessRule);
}

/**
 * Ruta que exige un permiso del anexo G (numeral 13.1, paso 8). Sin él responde 403. Si el
 * permiso es «solo lo propio», el caso de uso revisa además el registro concreto y responde 404
 * cuando no es de la persona (numeral 15.5).
 */
export function RequirePermission(code: PermissionCode): MethodDecorator & ClassDecorator {
  return applyDecorators(
    SetMetadata(ACCESS_KEY, 'permission' satisfies AccessRule),
    SetMetadata(PERMISSION_KEY, code),
  );
}

/**
 * Ruta sobre un registro de cualquier módulo, como sus comentarios y adjuntos (B16). El tipo de
 * registro llega en la petición, así que el permiso no se puede fijar en la ruta: el caso de uso
 * exige el permiso del anexo G que el módulo dueño define para ese tipo (403) y que la persona vea
 * el registro (404). Solo bajo /v1/comments y /v1/attachments.
 */
export function RequireRecordAccess(): CustomDecorator {
  return SetMetadata(ACCESS_KEY, 'record' satisfies AccessRule);
}

/**
 * Acción de alto riesgo (numeral 15.1): exige haber confirmado la identidad en los últimos 30
 * minutos. Si no, responde 403 REAUTHENTICATION_REQUIRED y la web pide contraseña y código.
 */
export function RecentAuthentication(): CustomDecorator {
  return SetMetadata(RECENT_AUTHENTICATION_KEY, true);
}

import type { UserKind } from '@arza/contracts';

// Direcciones de las pantallas de acceso (numeral 16.7) y a dónde va cada persona al entrar.

export const ACCESS_PATHS = {
  login: '/iniciar-sesion',
  activate: '/activar-cuenta',
  forgot: '/recuperar-contrasena',
  reset: '/restablecer-contrasena',
} as const;

export const PROFILE_PATH = '/app/perfil';

/** Motivos por los que se llega a la pantalla de inicio de sesión, con su aviso. */
export const LOGIN_NOTICES = {
  'cuenta-activada': 'Su cuenta quedó activa. Ya puede iniciar sesión con su correo y contraseña.',
  'contrasena-restablecida':
    'Su contraseña nueva quedó guardada. Por seguridad cerramos todas sus sesiones; inicie sesión de nuevo.',
  'contrasena-cambiada':
    'Su contraseña cambió. Por seguridad cerramos todas sus sesiones; inicie sesión de nuevo.',
  'sesion-cerrada': 'Cerró la sesión. Hasta pronto.',
  'sesion-vencida': 'Su sesión venció. Inicie sesión de nuevo para continuar.',
} as const;

export type LoginNotice = keyof typeof LOGIN_NOTICES;

export function homeFor(kind: UserKind): string {
  return kind === 'portal' ? '/portal' : '/app';
}

/**
 * Solo se vuelve a una dirección de la propia aplicación o del portal: un enlace manipulado no
 * puede llevar a la persona a otro sitio después de iniciar sesión.
 */
export function safeReturnPath(candidate: string | null, kind: UserKind): string {
  const home = homeFor(kind);
  if (candidate === null || candidate.startsWith('//') || candidate.includes('\\')) return home;
  return candidate === home || candidate.startsWith(`${home}/`) ? candidate : home;
}

export function loginPath(notice?: LoginNotice, returnTo?: string): string {
  const params = new URLSearchParams();
  if (notice !== undefined) params.set('motivo', notice);
  if (returnTo !== undefined) params.set('volver', returnTo);
  const query = params.toString();
  return query === '' ? ACCESS_PATHS.login : `${ACCESS_PATHS.login}?${query}`;
}

function isLoginNotice(value: string): value is LoginNotice {
  return Object.hasOwn(LOGIN_NOTICES, value);
}

/** Aviso para la pantalla de inicio de sesión; solo los motivos conocidos. */
export function loginNoticeOf(value: string | null): string | null {
  return value !== null && isLoginNotice(value) ? LOGIN_NOTICES[value] : null;
}

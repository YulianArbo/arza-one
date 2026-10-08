// Cuenta de usuario (ficha 17.2): invitado → activo → bloqueado → inactivo.

export type UserStatus = 'invited' | 'active' | 'locked' | 'inactive';
export type UserKind = 'internal' | 'portal' | 'service';

/** Solo una cuenta activa de persona puede iniciar sesión o recuperar su contraseña. */
export function canSignIn(user: { readonly status: string; readonly kind: string }): boolean {
  return user.status === 'active' && user.kind !== 'service';
}

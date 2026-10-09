// Segundo factor y confirmación de identidad (numeral 15.1, B09).

const MINUTE_MS = 60 * 1000;

/** Minutos para completar el segundo paso después de la contraseña. */
export const PENDING_SIGN_IN_MS = 10 * MINUTE_MS;
/** Minutos para confirmar un segundo factor recién creado con su primer código. */
export const SETUP_MS = 15 * MINUTE_MS;
/** Las acciones de alto riesgo exigen haber confirmado la identidad en los últimos 30 minutos. */
export const REAUTHENTICATION_WINDOW_MS = 30 * MINUTE_MS;
/** Códigos equivocados de una persona en 15 minutos antes de bloquear la cuenta. */
export const VERIFICATION_FAILURES_TO_LOCK = 5;
export const RECOVERY_CODE_COUNT = 10;
/** Quedan pocos códigos de recuperación: el aviso por correo lo recuerda. */
export const RECOVERY_CODES_LOW = 3;

interface MfaSubject {
  readonly kind: string;
  readonly mfaRequired: boolean;
}

/**
 * Obligatorio para todos los usuarios internos y, en el portal, para quien tenga la marca (los
 * administradores de cliente; B10 la pone según el rol). Para los demás es opcional.
 */
export function secondFactorRequired(user: MfaSubject): boolean {
  return user.kind === 'internal' || user.mfaRequired;
}

/** Quien tiene un segundo factor activo lo usa siempre, aunque para él sea opcional. */
export function needsSecondFactor(user: MfaSubject, hasFactor: boolean): boolean {
  return hasFactor || secondFactorRequired(user);
}

/**
 * Etapa del inicio de sesión: completa, falta escribir el código o falta configurar el segundo
 * factor (la persona no pasa de esa pantalla).
 */
export type SignInStage = 'complete' | 'second_factor' | 'second_factor_setup';

export function signInStage(authenticatedAt: Date | null, hasFactor: boolean): SignInStage {
  if (authenticatedAt !== null) return 'complete';
  return hasFactor ? 'second_factor' : 'second_factor_setup';
}

export function pendingSignInExpiresAt(now: Date): Date {
  return new Date(now.getTime() + PENDING_SIGN_IN_MS);
}

export function setupExpiresAt(now: Date): Date {
  return new Date(now.getTime() + SETUP_MS);
}

/** La identidad se confirmó (al entrar o con la ventana «Confirme que es usted») hace poco. */
export function isRecentlyVerified(verifiedAt: Date | null, now: Date): boolean {
  return verifiedAt !== null && now.getTime() - verifiedAt.getTime() < REAUTHENTICATION_WINDOW_MS;
}

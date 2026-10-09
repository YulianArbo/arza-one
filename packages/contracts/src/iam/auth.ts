import { z } from 'zod';

// Contratos de identidad (M01, B08 y B09): inicio de sesión, sesiones, invitación y contraseñas.

/** Reglas de contraseña del numeral 15.1: longitud, sin reglas de composición forzadas. */
export const PASSWORD_POLICY = { minLength: 12, maxLength: 128 } as const;

/** Códigos estables de los errores de identidad (numeral 14.2). */
export const IAM_ERROR_CODES = {
  invalidCredentials: 'INVALID_CREDENTIALS',
  loginDelayed: 'LOGIN_DELAYED',
  accountLocked: 'ACCOUNT_LOCKED',
  linkInvalid: 'LINK_INVALID',
  passwordTooShort: 'PASSWORD_TOO_SHORT',
  passwordTooLong: 'PASSWORD_TOO_LONG',
  passwordBreached: 'PASSWORD_BREACHED',
  passwordUnchanged: 'PASSWORD_UNCHANGED',
  currentPasswordIncorrect: 'CURRENT_PASSWORD_INCORRECT',
  csrfInvalid: 'CSRF_INVALID',
  emailTaken: 'EMAIL_TAKEN',
  secondFactorRequired: 'SECOND_FACTOR_REQUIRED',
  secondFactorCodeInvalid: 'SECOND_FACTOR_CODE_INVALID',
  secondFactorNotConfigured: 'SECOND_FACTOR_NOT_CONFIGURED',
  secondFactorAlreadyConfigured: 'SECOND_FACTOR_ALREADY_CONFIGURED',
  secondFactorSetupExpired: 'SECOND_FACTOR_SETUP_EXPIRED',
  secondFactorMandatory: 'SECOND_FACTOR_MANDATORY',
  signInAlreadyComplete: 'SIGN_IN_ALREADY_COMPLETE',
  reauthenticationRequired: 'REAUTHENTICATION_REQUIRED',
  reauthenticationFailed: 'REAUTHENTICATION_FAILED',
  sessionNotFound: 'SESSION_NOT_FOUND',
} as const;

export type PasswordShapeProblem = 'too_short' | 'too_long';

const characters = new Intl.Segmenter('es', { granularity: 'grapheme' });

/**
 * Revisa la longitud de una contraseña nueva, contando caracteres como los ve la persona y no
 * unidades de UTF-16: una tilde o un emoji cuentan como uno. La web y la API usan esta misma
 * regla; la API además la compara contra la lista de contraseñas filtradas.
 */
export function passwordShapeProblem(password: string): PasswordShapeProblem | null {
  const length = Array.from(characters.segment(password)).length;
  if (length < PASSWORD_POLICY.minLength) return 'too_short';
  if (length > PASSWORD_POLICY.maxLength) return 'too_long';
  return null;
}

/** Correo normalizado: sin espacios y en minúsculas. */
export const emailSchema = z
  .string()
  .trim()
  .toLowerCase()
  .pipe(z.email().max(254))
  .describe('Correo electrónico');

// Límite holgado de lo que se acepta en el campo; la regla de longitud la aplica la API con un
// mensaje propio (passwordShapeProblem). Evita que alguien envíe textos enormes al cálculo del hash.
export const passwordFieldSchema = z
  .string()
  .min(1)
  .max(PASSWORD_POLICY.maxLength * 4)
  .describe('Contraseña');

/** Llave de un enlace de invitación o de recuperación: 43 caracteres base64url. */
const linkTokenSchema = z
  .string()
  .regex(/^[\w-]{43}$/)
  .describe('Llave del enlace recibido por correo');

export const loginRequestSchema = z.object({
  email: emailSchema,
  password: passwordFieldSchema,
});

export const forgotPasswordRequestSchema = z.object({ email: emailSchema });

export const resetPasswordRequestSchema = z.object({
  token: linkTokenSchema,
  password: passwordFieldSchema,
});

export const acceptInvitationRequestSchema = z.object({
  token: linkTokenSchema,
  display_name: z.string().trim().min(2).max(120).describe('Nombre con el que se mostrará'),
  password: passwordFieldSchema,
});

export const changePasswordRequestSchema = z.object({
  current_password: passwordFieldSchema,
  new_password: passwordFieldSchema,
});

export const userKindSchema = z
  .enum(['internal', 'portal'])
  .describe('Aplicación interna o portal');

const sessionUserSchema = z.object({
  id: z.uuid(),
  email: z.email(),
  display_name: z.string().nullable(),
  kind: userKindSchema,
});

/**
 * Etapa del inicio de sesión (B09): completa, falta escribir el código del segundo factor o falta
 * configurarlo. Mientras no esté completa, la API solo atiende el segundo paso.
 */
export const signInStageSchema = z
  .enum(['complete', 'second_factor', 'second_factor_setup'])
  .describe('Etapa del inicio de sesión');

/** Sesión actual. El código antifalsificación se envía en la cabecera X-CSRF-Token. */
export const sessionResponseSchema = z.object({
  user: sessionUserSchema,
  stage: signInStageSchema,
  csrf_token: z.string().describe('Código antifalsificación de esta sesión'),
  expires_at: z.iso.datetime({ offset: true }).describe('Vencimiento total de la sesión'),
});

/** Datos del perfil propio. */
export const meResponseSchema = sessionUserSchema.extend({
  last_login_at: z.iso.datetime({ offset: true }).nullable(),
  password_changed_at: z.iso.datetime({ offset: true }).nullable(),
});

/** Respuesta que no revela nada: la misma exista o no la cuenta. */
export const acknowledgementResponseSchema = z.object({
  message: z.string().describe('Mensaje para la persona'),
});

export type LoginRequest = z.infer<typeof loginRequestSchema>;
export type ForgotPasswordRequest = z.infer<typeof forgotPasswordRequestSchema>;
export type ResetPasswordRequest = z.infer<typeof resetPasswordRequestSchema>;
export type AcceptInvitationRequest = z.infer<typeof acceptInvitationRequestSchema>;
export type ChangePasswordRequest = z.infer<typeof changePasswordRequestSchema>;
export type UserKind = z.infer<typeof userKindSchema>;
export type SignInStage = z.infer<typeof signInStageSchema>;
export type SessionResponse = z.infer<typeof sessionResponseSchema>;
export type MeResponse = z.infer<typeof meResponseSchema>;
export type AcknowledgementResponse = z.infer<typeof acknowledgementResponseSchema>;

import { z } from 'zod';

import { passwordFieldSchema, sessionResponseSchema } from './auth.js';

// Contratos del segundo factor, la confirmación de identidad y las sesiones activas (M01, B09).

/** Seis dígitos de la aplicación del celular. Se aceptan espacios, como «123 456». */
export const totpCodeSchema = z
  .string()
  .max(20)
  .transform((value) => value.replace(/\s/g, ''))
  .pipe(z.string().regex(/^\d{6}$/))
  .describe('Código de seis dígitos de la aplicación del celular');

/** Uno de los diez códigos de recuperación; con o sin guiones. */
export const recoveryCodeSchema = z
  .string()
  .trim()
  .min(16)
  .max(24)
  .describe('Código de recuperación, por ejemplo ABCD-EFGH-JKMN-PQRS');

/** El segundo paso: el código del celular o un código de recuperación, no los dos. */
export const secondFactorRequestSchema = z
  .strictObject({
    code: totpCodeSchema.optional(),
    recovery_code: recoveryCodeSchema.optional(),
  })
  .refine((value) => (value.code === undefined) !== (value.recovery_code === undefined), {
    message: 'Escriba el código de la aplicación o un código de recuperación, no los dos.',
  });

export const secondFactorSetupResponseSchema = z.object({
  secret: z.string().describe('Clave para escribir a mano en la aplicación del celular'),
  otpauth_uri: z.string().describe('Dirección otpauth:// que se muestra como código QR'),
  expires_at: z.iso
    .datetime({ offset: true })
    .describe('Plazo para confirmar con el primer código'),
});

export const secondFactorConfirmRequestSchema = z.strictObject({ code: totpCodeSchema });

/** Los códigos se muestran una sola vez; la API no los vuelve a entregar. */
export const recoveryCodesResponseSchema = z.object({
  recovery_codes: z.array(z.string()).describe('Diez códigos de recuperación de un solo uso'),
});

export const secondFactorConfirmResponseSchema = recoveryCodesResponseSchema.extend({
  session: sessionResponseSchema,
});

/** Confirmar que es usted: la contraseña y, si tiene segundo factor, su código. */
export const reauthenticateRequestSchema = z.strictObject({
  password: passwordFieldSchema,
  code: totpCodeSchema.optional(),
  recovery_code: recoveryCodeSchema.optional(),
});

export const secondFactorStatusResponseSchema = z.object({
  required: z.boolean().describe('Su tipo de usuario exige segundo factor'),
  enabled: z.boolean(),
  confirmed_at: z.iso.datetime({ offset: true }).nullable(),
  recovery_codes_remaining: z.number().int().min(0),
});

export const activeSessionSchema = z.object({
  id: z.uuid(),
  created_at: z.iso.datetime({ offset: true }),
  last_seen_at: z.iso.datetime({ offset: true }),
  ip: z.string().nullable(),
  browser: z.string().nullable().describe('Navegador que informó el equipo'),
  os: z.string().nullable().describe('Sistema que informó el equipo'),
  current: z.boolean().describe('Es la sesión de esta petición'),
  pending_second_factor: z.boolean().describe('Verificó la contraseña pero no el segundo factor'),
});

export const activeSessionsResponseSchema = z.object({ data: z.array(activeSessionSchema) });

export const closedSessionsResponseSchema = z.object({
  closed: z.number().int().min(0).describe('Sesiones cerradas'),
});

export type SecondFactorRequest = z.infer<typeof secondFactorRequestSchema>;
export type SecondFactorSetupResponse = z.infer<typeof secondFactorSetupResponseSchema>;
export type SecondFactorConfirmRequest = z.infer<typeof secondFactorConfirmRequestSchema>;
export type SecondFactorConfirmResponse = z.infer<typeof secondFactorConfirmResponseSchema>;
export type RecoveryCodesResponse = z.infer<typeof recoveryCodesResponseSchema>;
export type ReauthenticateRequest = z.infer<typeof reauthenticateRequestSchema>;
export type SecondFactorStatusResponse = z.infer<typeof secondFactorStatusResponseSchema>;
export type ActiveSession = z.infer<typeof activeSessionSchema>;
export type ActiveSessionsResponse = z.infer<typeof activeSessionsResponseSchema>;
export type ClosedSessionsResponse = z.infer<typeof closedSessionsResponseSchema>;

import type { JobsOptions } from 'bullmq';
import { z } from 'zod';

// Colas y trabajos en segundo plano (ADR-014, numeral 13.2). La API (o un comando) los encola y
// el worker los procesa; ambos usan estas mismas definiciones.

/** Colas de la plataforma. Cada módulo de negocio agregará las suyas. */
export const QUEUES = { platform: 'platform' } as const;

/**
 * Todo trabajo lleva la empresa en cuyo nombre se ejecuta, que el worker fija en la transacción
 * igual que la API (numeral 13.2), y el identificador de correlación para seguirlo en los registros.
 */
const tenantJobSchema = z.object({
  tenantId: z.uuid(),
  /** null en trabajos del sistema, sin usuario. */
  userId: z.uuid().nullable(),
  correlationId: z.uuid(),
});

/** Trabajo de ejemplo (B06): envía un correo de prueba con el nombre de la empresa. */
const exampleEmailJobSchema = tenantJobSchema.extend({
  recipient: z.email(),
});

/**
 * Correo de una cuenta: invitación, recuperación de contraseña o aviso de cambio (B08) y avisos de
 * seguridad del segundo factor y de un equipo nuevo (B09) y cambios de roles (B10). Solo lleva el usuario, el propósito y
 * el momento: el worker crea el enlace al enviarlo, así la llave nunca queda guardada en la cola, y
 * lee lo demás de la base de datos.
 */
const accountEmailJobSchema = tenantJobSchema.extend({
  accountUserId: z.uuid(),
  purpose: z.enum([
    'invitation',
    'password_reset',
    'password_changed',
    'mfa_enabled',
    'mfa_changed',
    'mfa_disabled',
    'mfa_reset',
    'recovery_codes_regenerated',
    'recovery_code_used',
    'new_device',
    'permissions_changed',
  ]),
  /** Momento del hecho que se avisa; los correos con enlace no lo necesitan. */
  occurredAt: z.iso.datetime({ offset: true }).optional(),
});

export type TenantJob = z.infer<typeof tenantJobSchema>;
export type ExampleEmailJob = z.infer<typeof exampleEmailJobSchema>;
export type AccountEmailJob = z.infer<typeof accountEmailJobSchema>;
export type AccountEmailPurpose = AccountEmailJob['purpose'];

/** Cada trabajo: su cola, su nombre y el esquema de sus datos. */
export const JOBS = {
  exampleEmail: {
    queue: QUEUES.platform,
    name: 'platform.example-email',
    schema: exampleEmailJobSchema,
  },
  accountEmail: {
    queue: QUEUES.platform,
    name: 'iam.account-email',
    schema: accountEmailJobSchema,
  },
} as const;

export type JobDefinition = (typeof JOBS)[keyof typeof JOBS];

const SECOND = 1000;
const DAY = 24 * 60 * 60 * SECOND;

/**
 * Reintentos de todo trabajo: seis intentos con espera creciente (5, 10, 20, 40 y 80 segundos;
 * unos dos minutos y medio en total). Los terminados se guardan 7 días y los fallidos 30, para
 * revisarlos (numeral 10.7: alerta con trabajos fallidos sin reintento).
 */
export const DEFAULT_JOB_OPTIONS: JobsOptions = {
  attempts: 6,
  backoff: { type: 'exponential', delay: 5 * SECOND },
  removeOnComplete: { age: (7 * DAY) / SECOND, count: 1000 },
  removeOnFail: { age: (30 * DAY) / SECOND },
};

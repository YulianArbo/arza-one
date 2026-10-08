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

export type TenantJob = z.infer<typeof tenantJobSchema>;
export type ExampleEmailJob = z.infer<typeof exampleEmailJobSchema>;

/** Cada trabajo: su cola, su nombre y el esquema de sus datos. */
export const JOBS = {
  exampleEmail: {
    queue: QUEUES.platform,
    name: 'platform.example-email',
    schema: exampleEmailJobSchema,
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

import { z } from 'zod';

const required = z.string().trim().min(1);
const positiveInteger = z.coerce.number().int().positive();

// Variables de entorno que el worker usa hoy (anexo F). Cada bloque agrega las suyas.
export const workerEnvSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']),
  APP_ENV: z.enum(['local', 'staging', 'production']),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace']).default('info'),
  DATABASE_URL: z.url({ protocol: /^postgres(ql)?$/ }),
  VALKEY_URL: z.url({ protocol: /^rediss?$/ }),
  /** Dirección de la aplicación interna: los enlaces de los correos van a su mismo dominio. */
  APP_URL: z.url({ protocol: /^https?$/ }),
  SMTP_HOST: required,
  SMTP_PORT: positiveInteger.max(65_535),
  SMTP_USER: required.optional(),
  SMTP_PASSWORD: required.optional(),
  MAIL_FROM: required,
  /** Trabajos que el worker procesa a la vez en cada cola. */
  WORKER_CONCURRENCY: positiveInteger.max(50).default(5),
});

export type WorkerEnv = z.infer<typeof workerEnvSchema>;

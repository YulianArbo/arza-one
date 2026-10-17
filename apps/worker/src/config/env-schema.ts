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
  /** Almacenamiento privado de archivos (Garage, ADR-013), para analizar lo que se sube (B14). */
  S3_ENDPOINT: z.url(),
  S3_REGION: required,
  S3_BUCKET: required,
  S3_ACCESS_KEY: required,
  S3_SECRET_KEY: required,
  /** Antivirus ClamAV (capítulo 8). */
  CLAMAV_HOST: required,
  CLAMAV_PORT: positiveInteger.max(65_535).default(3310),
  /** Conversión a PDF (Gotenberg, capítulo 9) de los archivos fuente de las versiones (B18). */
  GOTENBERG_URL: z.url({ protocol: /^https?$/ }),
  /** Trabajos que el worker procesa a la vez en cada cola. */
  WORKER_CONCURRENCY: positiveInteger.max(50).default(5),
});

export type WorkerEnv = z.infer<typeof workerEnvSchema>;

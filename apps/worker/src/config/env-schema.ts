import { z } from 'zod';

const required = z.string().trim().min(1);
const positiveInteger = z.coerce.number().int().positive();

// Variables de entorno que el worker usa hoy (anexo F). Cada bloque agrega las suyas.
const baseSchema = z.object({
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
  /**
   * Certificado de la empresa para el sello de los PDF firmados (numeral 19.3, B43): archivo
   * PKCS#12 en base64 y su clave. Secretos. Sin ellos, fuera de producción se usa uno temporal.
   */
  PDF_SEAL_PKCS12: z.base64().trim().min(1).optional(),
  PDF_SEAL_PASSPHRASE: required.optional(),
  /** Dirección de GlitchTip para los trabajos que fallan sin reintento (B44). Vacía: no se envían. */
  GLITCHTIP_DSN: z.url({ protocol: /^https?$/ }).optional(),
  /** Commit de la imagen; GlitchTip lo muestra como versión. */
  GIT_COMMIT: required.default('unknown'),
});

/** En producción el sello con el certificado de la empresa es obligatorio (decisión 4 de B43). */
export const workerEnvSchema = baseSchema.superRefine((env, context) => {
  const missing = (['PDF_SEAL_PKCS12', 'PDF_SEAL_PASSPHRASE'] as const).filter(
    (key) => env[key] === undefined,
  );
  if (env.APP_ENV === 'production' || missing.length === 1) {
    for (const key of missing) {
      context.addIssue({
        code: 'custom',
        path: [key],
        message: 'falta; el sello de los PDF firmados necesita el certificado y su clave',
      });
    }
  }
});

export type WorkerEnv = z.infer<typeof workerEnvSchema>;

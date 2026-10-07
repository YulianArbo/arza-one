import { z } from 'zod';

const required = z.string().trim().min(1);
const url = z.url();
const positiveInteger = z.coerce.number().int().positive();

// Variables de entorno que la API usa hoy (anexo F). Cada bloque agrega las suyas.
export const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']),
  APP_ENV: z.enum(['local', 'staging', 'production']),
  APP_URL: url,
  PORTAL_URL: url,
  PUBLIC_URL: url,
  API_URL: url,
  API_PORT: positiveInteger.max(65_535).default(4000),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace']).default('info'),
  DATABASE_URL: z.url({ protocol: /^postgres(ql)?$/ }),
  VALKEY_URL: z.url({ protocol: /^rediss?$/ }),
  S3_ENDPOINT: url,
  S3_REGION: required,
  S3_BUCKET: required,
  S3_ACCESS_KEY: required,
  S3_SECRET_KEY: required,
  RATE_LIMIT_WINDOW_SECONDS: positiveInteger,
  RATE_LIMIT_MAX_REQUESTS: positiveInteger,
  GIT_COMMIT: required.default('unknown'),
});

export type Env = z.infer<typeof envSchema>;

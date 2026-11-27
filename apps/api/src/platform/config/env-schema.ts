import { z } from 'zod';

const required = z.string().trim().min(1);
const url = z.url();
const positiveInteger = z.coerce.number().int().positive();

// Variables de entorno que la API usa hoy (anexo F). Cada bloque agrega las suyas.
export const envSchema = z
  .object({
    NODE_ENV: z.enum(['development', 'test', 'production']),
    APP_ENV: z.enum(['local', 'staging', 'production']),
    APP_URL: url,
    PORTAL_URL: url,
    PUBLIC_URL: url,
    API_URL: url,
    API_PORT: positiveInteger.max(65_535).default(4000),
    LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace']).default('info'),
    DATABASE_URL: z.url({ protocol: /^postgres(ql)?$/ }),
    /** Espera máxima por una conexión libre a PostgreSQL, en milisegundos. */
    DATABASE_CONNECT_TIMEOUT_MS: positiveInteger.default(2000),
    /** Espera máxima por el inicio de una transacción interactiva, en milisegundos. */
    DATABASE_TRANSACTION_MAX_WAIT_MS: positiveInteger.optional(),
    /** Duración máxima de una transacción interactiva, en milisegundos. */
    DATABASE_TRANSACTION_TIMEOUT_MS: positiveInteger.optional(),
    VALKEY_URL: z.url({ protocol: /^rediss?$/ }),
    S3_ENDPOINT: url,
    S3_REGION: required,
    S3_BUCKET: required,
    S3_ACCESS_KEY: required,
    S3_SECRET_KEY: required,
    RATE_LIMIT_WINDOW_SECONDS: positiveInteger,
    RATE_LIMIT_MAX_REQUESTS: positiveInteger,
    GIT_COMMIT: required.default('unknown'),
    /** Firma de los códigos antifalsificación (anexo F). Al menos 32 caracteres al azar. */
    CSRF_SECRET: z.string().min(32),
    /** Llave del cifrado de campos sensibles, como los secretos del segundo factor (anexo F). */
    FIELD_ENCRYPTION_KEY: z.string().min(32),
    /**
     * NIT de la empresa dueña del sitio público (B29): allí llegan las PQRSF que se radican sin
     * sesión. Vacío o sin definir, el formulario público responde que no está disponible.
     */
    PUBLIC_SITE_TAX_ID: z
      .string()
      .trim()
      .max(60)
      .optional()
      .transform((value) => (value === '' ? undefined : value)),
    /**
     * Llave de los vigilantes (Uptime Kuma) para leer /ops/status (B44). Al menos 32 caracteres al
     * azar. Vacía o sin definir, la ruta responde 401 a todos.
     */
    MONITOR_TOKEN: z.string().min(32).optional(),
    /** Dirección de GlitchTip para los errores inesperados (anexo F). Vacía: no se envían. */
    GLITCHTIP_DSN: z.url({ protocol: /^https?$/ }).optional(),
    /**
     * Proveedor de la pasarela de IA (B47, anexo F, decisión 2): off (apagado, por defecto),
     * rehearsal (modo de ensayo sin IA, nunca en producción) o anthropic (Claude).
     */
    AI_GATEWAY_PROVIDER: z.enum(['off', 'rehearsal', 'anthropic']).default('off'),
    /** Llave del proveedor de IA (secreto). Obligatoria con anthropic. */
    AI_GATEWAY_API_KEY: z.string().min(20).optional(),
    /** Modelo de Claude que usa la pasarela. */
    AI_GATEWAY_MODEL: z
      .string()
      .regex(/^claude-[a-z0-9-]+$/u)
      .default('claude-opus-5-5'),
    /** Usos del asistente por persona y por día (decisión 8). */
    AI_GATEWAY_DAILY_LIMIT: positiveInteger.max(1000).default(50),
    /** Caracteres máximos que se envían al modelo en un uso (decisión 8). */
    AI_GATEWAY_MAX_INPUT_CHARS: positiveInteger.min(2000).max(200_000).default(24_000),
    /** Espera máxima por la respuesta del proveedor, en milisegundos. */
    AI_GATEWAY_TIMEOUT_MS: positiveInteger.min(1000).max(300_000).default(60_000),
  })
  .superRefine((env, context) => {
    if (env.AI_GATEWAY_PROVIDER === 'anthropic' && env.AI_GATEWAY_API_KEY === undefined) {
      context.addIssue({
        code: 'custom',
        path: ['AI_GATEWAY_API_KEY'],
        message: 'falta; es obligatoria con AI_GATEWAY_PROVIDER=anthropic',
      });
    }
    if (env.AI_GATEWAY_PROVIDER === 'rehearsal' && env.APP_ENV === 'production') {
      context.addIssue({
        code: 'custom',
        path: ['AI_GATEWAY_PROVIDER'],
        message: 'el modo de ensayo no se usa en producción',
      });
    }
  });

export type Env = z.infer<typeof envSchema>;

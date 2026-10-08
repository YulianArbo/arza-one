import { z } from 'zod';

import { envSchema, type Env } from './env-schema.js';

// Mensajes de validación en español.
z.config(z.locales.es());

/** Configuración inválida. El mensaje nombra las variables, nunca sus valores. */
export class ConfigError extends Error {
  constructor(
    readonly problems: readonly string[],
    service = 'La API',
  ) {
    super(
      [
        `${service} no puede arrancar: la configuración no es válida.`,
        'Revise estas variables de entorno (archivo .env en la raíz del proyecto):',
        ...problems.map((problem) => `  - ${problem}`),
      ].join('\n'),
    );
    this.name = 'ConfigError';
  }
}

type RawEnv = Record<string, string | undefined>;

/** Trata las variables vacías como ausentes para que los valores por defecto apliquen. */
function withoutEmptyValues(raw: RawEnv): RawEnv {
  return Object.fromEntries(Object.entries(raw).filter(([, value]) => value?.trim() !== ''));
}

function describeIssue(issue: z.core.$ZodIssue, raw: RawEnv): string {
  const name = issue.path.join('.');
  if (raw[name] === undefined) return `${name}: falta; es obligatoria`;
  return `${name}: ${issue.message}`;
}

/**
 * Valida las variables de entorno de un servicio con su esquema (numeral 13.2). Lanza ConfigError
 * si algo falla. La usan la API y el worker, cada uno con sus variables.
 */
export function loadEnv<Schema extends z.ZodType>(
  schema: Schema,
  raw: RawEnv,
  service: string,
): z.output<Schema> {
  const present = withoutEmptyValues(raw);
  const result = schema.safeParse(present);
  if (result.success) return result.data;
  const problems = result.error.issues.map((issue) => describeIssue(issue, present));
  throw new ConfigError(problems, service);
}

/** Configuración de la API. */
export function loadConfig(raw: RawEnv): Env {
  return loadEnv(envSchema, raw, 'La API');
}

import { z } from 'zod';

import { envSchema, type Env } from './env-schema.js';

// Mensajes de validación en español.
z.config(z.locales.es());

/** Configuración inválida. El mensaje nombra las variables, nunca sus valores. */
export class ConfigError extends Error {
  constructor(readonly problems: readonly string[]) {
    super(
      [
        'La API no puede arrancar: la configuración no es válida.',
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

/** Valida las variables de entorno al arrancar (numeral 13.2). Lanza ConfigError si algo falla. */
export function loadConfig(raw: RawEnv): Env {
  const present = withoutEmptyValues(raw);
  const result = envSchema.safeParse(present);
  if (result.success) return result.data;
  throw new ConfigError(result.error.issues.map((issue) => describeIssue(issue, present)));
}

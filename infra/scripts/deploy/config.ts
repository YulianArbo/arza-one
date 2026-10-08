// Datos del despliegue (B07). Llegan como variables de entorno desde GitHub Actions: los secretos
// del ambiente «pruebas» (llave SSH, contraseña adicional) y sus variables (servidor, dominio).
import { z } from 'zod';

import { DeployError } from './remote.ts';

const text = z.string().trim().min(1);

const deployEnvSchema = z.object({
  /** ssh: el servidor real. local: este mismo equipo (ensayo de GitHub). */
  STAGING_TARGET: z.enum(['ssh', 'local']).default('ssh'),
  STAGING_HOST: text.optional(),
  STAGING_SSH_USER: text.default('deploy'),
  STAGING_SSH_PORT: z.coerce.number().int().min(1).max(65_535).default(22),
  STAGING_BASE_DIR: text.default('/srv/arza-one'),
  STAGING_DOMAIN: z.string().regex(/^[a-z0-9.-]+$/, 'solo minúsculas, números, puntos y guiones'),
  STAGING_AUTH_USER: text,
  STAGING_AUTH_PASSWORD: text,
  APP_VERSION: text,
  IMAGE_REGISTRY: text,
  REGISTRY_USER: text.optional(),
  REGISTRY_TOKEN: text.optional(),
  /** Ensayo: confiar en la autoridad local de Caddy en lugar de Let's Encrypt. */
  STAGING_TRUST_LOCAL_CA: z.enum(['0', '1']).default('0'),
});

export type DeployEnv = z.infer<typeof deployEnvSchema>;

export function loadDeployEnv(env: Readonly<Record<string, string | undefined>>): DeployEnv {
  const blankless = Object.fromEntries(Object.entries(env).filter(([, value]) => value !== ''));
  const parsed = deployEnvSchema.safeParse(blankless);
  if (!parsed.success) {
    const fields = parsed.error.issues.map((issue) => `${issue.path.join('.')}: ${issue.message}`);
    throw new DeployError(
      `Faltan datos del despliegue o no son válidos:\n  ${fields.join('\n  ')}`,
    );
  }
  if (parsed.data.STAGING_TARGET === 'ssh' && parsed.data.STAGING_HOST === undefined) {
    throw new DeployError('Falta STAGING_HOST: la dirección del servidor de pruebas.');
  }
  return parsed.data;
}

/** El registro es la primera parte de IMAGE_REGISTRY (por ejemplo ghcr.io). */
export function registryHost(registry: string): string {
  return registry.split('/')[0] ?? registry;
}

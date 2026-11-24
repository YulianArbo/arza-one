// Datos del despliegue a producción (B44, numeral 10.6). Llegan de GitHub Actions: los secretos
// del ambiente «produccion» (llave SSH) y sus variables (servidor, dominio). Solo se publica una
// versión etiquetada vX.Y.Z, y fuera de la ventana solo una corrección urgente de seguridad.
import { z } from 'zod';

import { DeployError } from './remote.ts';

const text = z.string().trim().min(1);

const productionEnvSchema = z.object({
  /** ssh: el servidor real. local: este mismo equipo (ensayo de GitHub). */
  PRODUCTION_TARGET: z.enum(['ssh', 'local']).default('ssh'),
  PRODUCTION_HOST: text.optional(),
  PRODUCTION_SSH_USER: text.default('deploy'),
  PRODUCTION_SSH_PORT: z.coerce.number().int().min(1).max(65_535).default(22),
  PRODUCTION_BASE_DIR: text.default('/srv/arza-one'),
  /** Dominio raíz: www., app., clientes. y api. cuelgan de él (numeral 10.4). */
  PRODUCTION_DOMAIN: z
    .string()
    .regex(/^[a-z0-9-]+(\.[a-z0-9-]+)+$/, 'solo minúsculas, números, puntos y guiones'),
  APP_VERSION: z.string().regex(/^v\d+\.\d+\.\d+$/, 'producción solo publica versiones vX.Y.Z'),
  IMAGE_REGISTRY: text,
  REGISTRY_USER: text.optional(),
  REGISTRY_TOKEN: text.optional(),
  /** «1» solo para una corrección urgente de seguridad fuera de la ventana de publicación. */
  URGENT_SECURITY_FIX: z.enum(['0', '1']).default('0'),
  /** Ensayo: confiar en la autoridad local de Caddy en lugar de Let's Encrypt. */
  PRODUCTION_TRUST_LOCAL_CA: z.enum(['0', '1']).default('0'),
});

export type ProductionEnv = z.infer<typeof productionEnvSchema>;

export function loadProductionEnv(
  env: Readonly<Record<string, string | undefined>>,
): ProductionEnv {
  const blankless = Object.fromEntries(Object.entries(env).filter(([, value]) => value !== ''));
  const parsed = productionEnvSchema.safeParse(blankless);
  if (!parsed.success) {
    const fields = parsed.error.issues.map((issue) => `${issue.path.join('.')}: ${issue.message}`);
    throw new DeployError(
      `Faltan datos del despliegue a producción o no son válidos:\n  ${fields.join('\n  ')}`,
    );
  }
  if (parsed.data.PRODUCTION_TARGET === 'ssh' && parsed.data.PRODUCTION_HOST === undefined) {
    throw new DeployError('Falta PRODUCTION_HOST: la dirección del servidor de producción.');
  }
  return parsed.data;
}

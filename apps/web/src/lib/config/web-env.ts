import { z } from 'zod';

// Variables de entorno que usa la web (anexo F). Se validan al leerlas: si falta una o tiene
// un formato inválido, la página falla con un mensaje claro en lugar de comportarse mal.
const webEnvSchema = z.object({
  API_URL: z.url({ protocol: /^https?$/ }).describe('Dirección de la API'),
  APP_ENV: z.enum(['local', 'staging', 'production']).default('local'),
  NODE_ENV: z.enum(['development', 'production', 'test']).default('production'),
});

export type WebEnv = z.infer<typeof webEnvSchema>;

export function loadWebEnv(source: Record<string, string | undefined> = process.env): WebEnv {
  const result = webEnvSchema.safeParse(source);
  if (!result.success) {
    const fields = result.error.issues.map((issue) => issue.path.join('.')).join(', ');
    throw new Error(`Configuración de la web inválida: revise ${fields} en el archivo .env`);
  }
  return result.data;
}

/** Origen de la API sin ruta final, para la política de seguridad y el cliente. */
export function apiOrigin(env: WebEnv): string {
  return new URL(env.API_URL).origin;
}

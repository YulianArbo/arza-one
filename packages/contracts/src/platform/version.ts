import { z } from 'zod';

export const versionResponseSchema = z.object({
  version: z.string().describe('Versión semántica de la API'),
  environment: z.enum(['local', 'staging', 'production']).describe('Ambiente de ejecución'),
  commit: z.string().describe('Commit desplegado, o unknown si no se informó'),
});

export type VersionResponse = z.infer<typeof versionResponseSchema>;

import { z } from 'zod';

export const HEALTH_COMPONENTS = ['database', 'queues', 'files'] as const;

const componentStatusSchema = z.enum(['up', 'down']);

// Estado de la API y de las piezas de las que depende. Nunca incluye detalles internos.
export const healthResponseSchema = z.object({
  status: z.enum(['ok', 'degraded']).describe('ok si todas las piezas responden'),
  checks: z.object({
    database: componentStatusSchema.describe('PostgreSQL'),
    queues: componentStatusSchema.describe('Valkey (colas y caché)'),
    files: componentStatusSchema.describe('Almacenamiento de archivos S3'),
  }),
});

export type HealthComponent = (typeof HEALTH_COMPONENTS)[number];
export type ComponentStatus = z.infer<typeof componentStatusSchema>;
export type HealthResponse = z.infer<typeof healthResponseSchema>;

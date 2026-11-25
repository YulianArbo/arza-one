import { z } from 'zod';

// Estado de operación para los vigilantes (numeral 10.7, B44). Solo cifras de la plataforma:
// nunca datos de una empresa ni de una persona.

export const OPS_ALERTS = ['slow_api', 'error_rate', 'queue_backlog', 'queue_failed'] as const;

export const opsStatusResponseSchema = z.object({
  status: z.enum(['ok', 'alert']).describe('alert si alguna cifra pasa su umbral'),
  alerts: z.array(z.enum(OPS_ALERTS)).describe('Umbrales superados'),
  window_minutes: z.number().int().describe('Minutos que cubren las cifras de peticiones'),
  requests: z.number().int().describe('Peticiones atendidas en la ventana'),
  p95_ms: z.number().nullable().describe('Percentil 95 del tiempo de respuesta, en milisegundos'),
  error_rate: z.number().nullable().describe('Proporción de respuestas 5xx (0 a 1)'),
  queue: z.object({
    pending: z.number().int().describe('Trabajos en espera o programados'),
    failed: z.number().int().describe('Trabajos fallidos que ya no se reintentan'),
  }),
});

export type OpsAlert = (typeof OPS_ALERTS)[number];
export type OpsStatusResponse = z.infer<typeof opsStatusResponseSchema>;

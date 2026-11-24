import type { OpsAlert } from '@arza/contracts';

import type { RequestSummary } from './request-metrics.js';

// Umbrales del numeral 10.7 que la API puede medir por sí misma.

/** Percentil 95 del tiempo de respuesta por encima del cual se alerta (capítulo 25). */
export const SLOW_P95_MS = 800;
/** Tasa de respuestas 5xx por encima de la cual se alerta. */
export const ERROR_RATE_LIMIT = 0.01;
/**
 * Con muy pocas peticiones una sola falla dispara la tasa: la alerta de errores pide al menos
 * este número de peticiones en la ventana. Los errores sueltos los avisa GlitchTip.
 */
export const MIN_REQUESTS_FOR_RATE = 100;
/** Trabajos en espera, o fallidos sin reintento, por encima de los cuales se alerta. */
export const QUEUE_LIMIT = 100;

export interface QueueFigures {
  readonly pending: number;
  readonly failed: number;
}

export function opsAlerts(requests: RequestSummary, queue: QueueFigures): OpsAlert[] {
  const alerts: OpsAlert[] = [];
  if (requests.p95Ms !== null && requests.p95Ms > SLOW_P95_MS) alerts.push('slow_api');
  if (
    requests.errorRate !== null &&
    requests.requests >= MIN_REQUESTS_FOR_RATE &&
    requests.errorRate > ERROR_RATE_LIMIT
  ) {
    alerts.push('error_rate');
  }
  if (queue.pending > QUEUE_LIMIT) alerts.push('queue_backlog');
  if (queue.failed > QUEUE_LIMIT) alerts.push('queue_failed');
  return alerts;
}

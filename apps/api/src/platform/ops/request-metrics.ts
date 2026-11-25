import type { NextFunction, Request, Response } from 'express';

// Tiempos de respuesta y errores de los últimos 10 minutos, en memoria (numeral 10.7). Bastan
// para las alertas «percentil 95 sobre 800 ms durante 10 minutos» y «tasa de errores sobre 1 %»;
// la API corre en un solo contenedor por servidor (ADR-017).

const MINUTE_MS = 60_000;
export const METRICS_WINDOW_MINUTES = 10;
const WINDOW_MS = METRICS_WINDOW_MINUTES * MINUTE_MS;
const PERCENTILE = 0.95;

/** Rutas de los vigilantes: no cuentan, para que su propia consulta no mueva las cifras. */
const UNMEASURED = /^\/(health|version|ops)(\/|$)/;

interface Sample {
  readonly at: number;
  readonly ms: number;
  readonly failed: boolean;
}

export interface RequestSummary {
  readonly requests: number;
  readonly p95Ms: number | null;
  readonly errorRate: number | null;
}

export class RequestMetrics {
  private samples: Sample[] = [];

  record(at: number, ms: number, status: number): void {
    this.samples.push({ at, ms, failed: status >= 500 });
    this.prune(at);
  }

  summary(now: number): RequestSummary {
    this.prune(now);
    const count = this.samples.length;
    if (count === 0) return { requests: 0, p95Ms: null, errorRate: null };
    const sorted = this.samples.map((sample) => sample.ms).sort((a, b) => a - b);
    const index = Math.min(count - 1, Math.ceil(PERCENTILE * count) - 1);
    const failed = this.samples.filter((sample) => sample.failed).length;
    return { requests: count, p95Ms: sorted[index] ?? null, errorRate: failed / count };
  }

  private prune(now: number): void {
    const since = now - WINDOW_MS;
    const first = this.samples.findIndex((sample) => sample.at >= since);
    if (first === -1) this.samples = [];
    else if (first > 0) this.samples = this.samples.slice(first);
  }
}

/** Middleware de Express que mide cada petición al terminar de responder. */
export function measureRequests(metrics: RequestMetrics, now: () => number = Date.now) {
  return (request: Request, response: Response, next: NextFunction): void => {
    if (UNMEASURED.test(request.path)) {
      next();
      return;
    }
    const started = performance.now();
    response.on('finish', () => {
      metrics.record(now(), performance.now() - started, response.statusCode);
    });
    next();
  };
}

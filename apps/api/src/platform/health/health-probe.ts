import type { HealthComponent } from '@arza/contracts';

/** Revisa que una pieza externa responda. Lanza un error si no responde. */
export interface HealthProbe {
  readonly component: HealthComponent;
  check(): Promise<void>;
}

export const HEALTH_PROBES = Symbol('HEALTH_PROBES');

/** Tiempo máximo que /health espera a cada pieza. */
export const PROBE_TIMEOUT_MS = 2000;

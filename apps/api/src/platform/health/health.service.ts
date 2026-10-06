import { Inject, Injectable } from '@nestjs/common';
import type { ComponentStatus, HealthResponse } from '@arza/contracts';
import { PinoLogger } from 'nestjs-pino';

import { HEALTH_PROBES, PROBE_TIMEOUT_MS, type HealthProbe } from './health-probe.js';

function withTimeout(work: Promise<void>, milliseconds: number): Promise<void> {
  let timer: NodeJS.Timeout | undefined;
  const timeout = new Promise<never>((_resolve, reject) => {
    timer = setTimeout(() => {
      reject(new Error(`Sin respuesta en ${String(milliseconds)} ms`));
    }, milliseconds);
  });
  return Promise.race([work, timeout]).finally(() => {
    clearTimeout(timer);
  });
}

/** Consulta en paralelo cada pieza externa y resume su estado (criterio de B02). */
@Injectable()
export class HealthService {
  constructor(
    @Inject(HEALTH_PROBES) private readonly probes: readonly HealthProbe[],
    @Inject(PinoLogger) private readonly logger: PinoLogger,
  ) {
    logger.setContext(HealthService.name);
  }

  async check(): Promise<HealthResponse> {
    const checks: HealthResponse['checks'] = { database: 'down', queues: 'down', files: 'down' };
    const results = await Promise.all(this.probes.map(async (probe) => this.run(probe)));
    for (const [index, probe] of this.probes.entries()) {
      checks[probe.component] = results[index] ?? 'down';
    }
    const allUp = Object.values(checks).every((status) => status === 'up');
    return { status: allUp ? 'ok' : 'degraded', checks };
  }

  private async run(probe: HealthProbe): Promise<ComponentStatus> {
    try {
      await withTimeout(probe.check(), PROBE_TIMEOUT_MS);
      return 'up';
    } catch (error) {
      // El detalle queda en el registro interno; /health solo dice up o down.
      this.logger.warn({ component: probe.component, err: error }, 'Pieza sin respuesta');
      return 'down';
    }
  }
}

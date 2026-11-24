import { Inject, Injectable } from '@nestjs/common';
import type { OpsStatusResponse } from '@arza/contracts';

import { CLOCK, type Clock } from '../clock/clock.js';
import { JobQueue } from '../queues/job-queue.js';
import { opsAlerts, type QueueFigures } from './ops-thresholds.js';
import { METRICS_WINDOW_MINUTES, RequestMetrics } from './request-metrics.js';

/** Lo que leen los vigilantes en /ops/status: cifras de la plataforma, sin datos de empresas. */
@Injectable()
export class OpsStatusService {
  constructor(
    @Inject(RequestMetrics) private readonly metrics: RequestMetrics,
    @Inject(JobQueue) private readonly queue: JobQueue,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  async status(): Promise<OpsStatusResponse> {
    const requests = this.metrics.summary(this.clock.now().getTime());
    const queue: QueueFigures = await this.queue.figures();
    const alerts = opsAlerts(requests, queue);
    return {
      status: alerts.length === 0 ? 'ok' : 'alert',
      alerts,
      window_minutes: METRICS_WINDOW_MINUTES,
      requests: requests.requests,
      p95_ms: requests.p95Ms === null ? null : Math.round(requests.p95Ms),
      error_rate: requests.errorRate,
      queue,
    };
  }
}

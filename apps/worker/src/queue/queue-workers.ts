import { QUEUES } from '@arza/api/platform';
import { Worker, type ConnectionOptions, type Job } from 'bullmq';
import type { Logger } from 'pino';

import { InFlightJobs } from './in-flight-jobs.js';
import { describeJob, jobKey, willRetry } from './job-log.js';
import type { JobHandler } from './job-router.js';

export interface QueueWorkersOptions {
  readonly connection: ConnectionOptions;
  readonly concurrency: number;
  readonly logger: Logger;
}

/** Procesadores de las colas en marcha. */
export interface QueueWorkers {
  readonly queues: readonly string[];
  /**
   * Deja de tomar trabajos, espera los que están en curso (como máximo `graceMs`) y cierra.
   * El cierre no espera a Valkey: si no responde, el worker igual se apaga.
   */
  stop(graceMs: number): Promise<void>;
}

function watch(worker: Worker, logger: Logger, inFlight: InFlightJobs): void {
  worker.on('completed', (job) => {
    inFlight.finish(jobKey(job));
    logger.info(describeJob(job), 'Trabajo terminado');
  });
  worker.on('failed', (job, error) => {
    inFlight.finish(jobKey(job));
    const retry = willRetry(job, error);
    const message = retry ? 'Trabajo fallido; se reintentará' : 'Trabajo fallido sin reintento';
    logger.warn({ ...describeJob(job), reason: error.message }, message);
  });
  worker.on('error', (error) => {
    logger.error({ reason: error.message }, 'Error de la cola');
  });
}

/** Un procesador de BullMQ por cola de la plataforma (ADR-014). */
export function startQueueWorkers(handler: JobHandler, options: QueueWorkersOptions): QueueWorkers {
  const inFlight = new InFlightJobs();
  const runJob = async (job: Job): Promise<void> => {
    inFlight.start(jobKey(job));
    await handler(job);
  };
  const workers = Object.values(QUEUES).map((queue) => {
    const worker = new Worker(queue, runJob, {
      connection: options.connection,
      concurrency: options.concurrency,
    });
    watch(worker, options.logger, inFlight);
    return worker;
  });
  const stop = async (graceMs: number): Promise<void> => {
    // pause(true) solo marca la pausa: no espera a Valkey ni a los trabajos.
    await Promise.all(workers.map(async (worker) => worker.pause(true)));
    if (!(await inFlight.settle(graceMs))) {
      options.logger.warn({ pending: inFlight.size }, 'Trabajos sin terminar al apagar');
    }
    // El cierre normal de BullMQ espera a Valkey sin límite; el forzado, no.
    await Promise.all(workers.map(async (worker) => worker.close(true)));
  };
  return { queues: workers.map((worker) => worker.name), stop };
}

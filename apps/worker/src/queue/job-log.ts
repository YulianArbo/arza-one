import { UnrecoverableError, type Job } from 'bullmq';

/** Lo que se lee de un trabajo de BullMQ para registrarlo. */
export type LoggedJob = Pick<Job, 'id' | 'name' | 'queueName' | 'attemptsMade' | 'opts' | 'data'>;

/** Lo que se registra de un trabajo: nunca sus datos, que pueden traer datos personales. */
export function describeJob(job: LoggedJob | undefined): Record<string, unknown> {
  if (job === undefined) return {};
  const data: unknown = job.data;
  const context = typeof data === 'object' && data !== null ? data : {};
  return {
    job_id: job.id,
    job_name: job.name,
    queue: job.queueName,
    attempt: job.attemptsMade,
    max_attempts: job.opts.attempts,
    tenant_id: 'tenantId' in context ? context.tenantId : undefined,
    correlation_id: 'correlationId' in context ? context.correlationId : undefined,
  };
}

/** Identifica un trabajo entre todas las colas; undefined si BullMQ no entregó el trabajo. */
export function jobKey(job: Pick<Job, 'queueName' | 'id'> | undefined): string | undefined {
  return job === undefined ? undefined : `${job.queueName}:${job.id ?? 'sin-id'}`;
}

/** BullMQ reintenta salvo que el error lo prohíba o se hayan agotado los intentos. */
export function willRetry(job: LoggedJob | undefined, error: Error): boolean {
  if (job === undefined || error instanceof UnrecoverableError) return false;
  return job.attemptsMade < (job.opts.attempts ?? 1);
}

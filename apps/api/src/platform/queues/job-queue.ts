import { Queue, type ConnectionOptions } from 'bullmq';
import type { z } from 'zod';

import { DEFAULT_JOB_OPTIONS, QUEUES, type JobDefinition } from './jobs.js';

/**
 * Encola trabajos. Valida los datos con el esquema del trabajo antes de enviarlos: a la cola
 * nunca llega un trabajo que el worker vaya a rechazar por su forma.
 */
export class JobQueue {
  private readonly queues = new Map<string, Queue>();

  constructor(private readonly connection: ConnectionOptions) {}

  async add<Job extends JobDefinition>(job: Job, payload: z.input<Job['schema']>): Promise<string> {
    const data = job.schema.parse(payload);
    const added = await this.queue(job.queue).add(job.name, data, DEFAULT_JOB_OPTIONS);
    if (added.id === undefined) {
      throw new Error(`Valkey no asignó identificador al trabajo ${job.name}.`);
    }
    return added.id;
  }

  /** Registra (o actualiza) un trabajo programado; repetirlo no lo duplica. */
  async schedule(scheduled: {
    readonly id: string;
    readonly job: JobDefinition;
    readonly pattern: string;
  }): Promise<void> {
    await this.queue(scheduled.job.queue).upsertJobScheduler(
      scheduled.id,
      { pattern: scheduled.pattern, tz: 'America/Bogota' },
      { name: scheduled.job.name, data: {}, opts: DEFAULT_JOB_OPTIONS },
    );
  }

  /** Trabajos en espera (o programados) y fallidos sin reintento de todas las colas (10.7). */
  async figures(): Promise<{ pending: number; failed: number }> {
    const counts = await Promise.all(
      Object.values(QUEUES).map(async (name) =>
        this.queue(name).getJobCounts('waiting', 'delayed', 'failed'),
      ),
    );
    const sum = (key: string) => counts.reduce((total, count) => total + (count[key] ?? 0), 0);
    return { pending: sum('waiting') + sum('delayed'), failed: sum('failed') };
  }

  async close(): Promise<void> {
    await Promise.all([...this.queues.values()].map(async (queue) => queue.close()));
  }

  private queue(name: string): Queue {
    const existing = this.queues.get(name);
    if (existing) return existing;
    const created = new Queue(name, { connection: this.connection });
    this.queues.set(name, created);
    return created;
  }
}

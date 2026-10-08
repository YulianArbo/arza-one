import { Queue } from 'bullmq';
import { v7 as uuidv7 } from 'uuid';
import { afterAll, describe, expect, inject, it } from 'vitest';

import { JobQueue } from '../../src/platform/queues/job-queue.js';
import { DEFAULT_JOB_OPTIONS, JOBS, type ExampleEmailJob } from '../../src/platform/queues/jobs.js';

// Encolar trabajos en Valkey real (ADR-014). El worker los procesa: ver apps/worker.

const connection = { url: inject('valkeyUrl') };
const jobs = new JobQueue(connection);
const inspector = new Queue(JOBS.exampleEmail.queue, { connection });

afterAll(async () => {
  await jobs.close();
  await inspector.close();
});

function validPayload(): ExampleEmailJob {
  return {
    tenantId: uuidv7(),
    userId: null,
    correlationId: uuidv7(),
    recipient: 'pruebas@arza-one.test',
  };
}

describe('JobQueue', () => {
  it('encola el trabajo con sus datos y la política de reintentos', async () => {
    const payload = validPayload();
    const id = await jobs.add(JOBS.exampleEmail, payload);
    const job = await inspector.getJob(id);
    expect(job?.name).toBe('platform.example-email');
    expect(job?.data).toEqual(payload);
    expect(job?.opts.attempts).toBe(DEFAULT_JOB_OPTIONS.attempts);
    expect(job?.opts.backoff).toEqual(DEFAULT_JOB_OPTIONS.backoff);
  });

  it('rechaza datos inválidos sin encolar nada', async () => {
    const before = await inspector.count();
    await expect(
      jobs.add(JOBS.exampleEmail, { ...validPayload(), tenantId: 'no-es-un-uuid' }),
    ).rejects.toThrow();
    await expect(
      jobs.add(JOBS.exampleEmail, { ...validPayload(), recipient: 'sin-arroba' }),
    ).rejects.toThrow();
    expect(await inspector.count()).toBe(before);
  });

  it('encola varios trabajos, cada uno con su identificador', async () => {
    const first = await jobs.add(JOBS.exampleEmail, validPayload());
    const second = await jobs.add(JOBS.exampleEmail, validPayload());
    expect(first).not.toBe(second);
  });
});

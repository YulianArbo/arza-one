import { hostname } from 'node:os';

import type { INestApplicationContext } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { DatabaseService, JOBS, JobQueue, QUEUES } from '@arza/api/platform';
import { Queue, QueueEvents } from 'bullmq';
import { Redis } from 'ioredis';
import { v7 as uuidv7 } from 'uuid';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { isAlive } from '../../src/heartbeat/heartbeat.js';
import { WorkerModule } from '../../src/worker.module.js';
import { createTenant, mailsAbout, workerConfig, type TestTenant } from './support/services.js';

// El worker completo, como en producción, contra PostgreSQL, Valkey y Mailpit reales.

const config = workerConfig(1);
const connection = { url: config.VALKEY_URL };
let app: INestApplicationContext;
let database: DatabaseService;
let tenant: TestTenant;
let jobs: JobQueue;
let queue: Queue;
let events: QueueEvents;

beforeAll(async () => {
  database = new DatabaseService(config.DATABASE_URL);
  tenant = await createTenant(database, `Trabajo ${uuidv7().slice(-6)}`);
  jobs = new JobQueue(connection);
  queue = new Queue(QUEUES.platform, { connection });
  events = new QueueEvents(QUEUES.platform, { connection });
  await events.waitUntilReady();
  app = await NestFactory.createApplicationContext(WorkerModule.forRoot(config), { logger: false });
  await app.init();
});

afterAll(async () => {
  await app.close();
  await Promise.all([jobs.close(), queue.close(), events.close(), database.onModuleDestroy()]);
});

async function runExampleJob(tenantId: string): Promise<string> {
  const id = await jobs.add(JOBS.exampleEmail, {
    tenantId,
    userId: null,
    correlationId: uuidv7(),
    recipient: 'pruebas@arza-one.test',
  });
  return id;
}

describe('worker: trabajo de ejemplo de principio a fin', () => {
  it('procesa el trabajo y el correo llega a Mailpit con el nombre de la empresa', async () => {
    const id = await runExampleJob(tenant.id);
    const job = await queue.getJob(id);
    await job?.waitUntilFinished(events, 30_000);
    const mails = await mailsAbout(tenant.tradeName);
    expect(mails).toHaveLength(1);
    expect(mails[0]?.To[0]?.Address).toBe('pruebas@arza-one.test');
    expect((await queue.getJob(id))?.attemptsMade).toBe(1);
  });

  it('un trabajo de una empresa inexistente falla una sola vez, sin reintentos', async () => {
    const id = await runExampleJob(uuidv7());
    const job = await queue.getJob(id);
    await expect(job?.waitUntilFinished(events, 30_000)).rejects.toThrow(
      'La empresa del trabajo no existe',
    );
    const finished = await queue.getJob(id);
    expect(await finished?.getState()).toBe('failed');
    expect(finished?.attemptsMade).toBe(1);
  });
});

describe('worker: latido', () => {
  it('emite su latido en Valkey mientras está encendido', async () => {
    const client = new Redis(config.VALKEY_URL);
    try {
      expect(await isAlive(client, hostname())).toBe(true);
    } finally {
      client.disconnect();
    }
  });
});

import { createHash } from 'node:crypto';

import type { INestApplicationContext } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { DatabaseService, JOBS, JobQueue, QUEUES } from '@arza/api/platform';
import { Queue, QueueEvents } from 'bullmq';
import { v7 as uuidv7 } from 'uuid';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { WorkerModule } from '../../src/worker.module.js';
import { createTenant, mailTextTo, workerConfig, type TestTenant } from './support/services.js';

// Correos de la cuenta (B08) de principio a fin: la cola, el worker, PostgreSQL y Mailpit reales.

const config = workerConfig(6);
const connection = { url: config.VALKEY_URL };
let app: INestApplicationContext;
let database: DatabaseService;
let tenant: TestTenant;
let jobs: JobQueue;
let queue: Queue;
let events: QueueEvents;

beforeAll(async () => {
  database = new DatabaseService(config.DATABASE_URL);
  tenant = await createTenant(database, `Cuentas ${uuidv7().slice(-6)}`);
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

async function invitedUser(email: string): Promise<string> {
  const user = await database.withTenant({ tenantId: tenant.id, userId: null }, (tx) =>
    tx.user.create({ data: { tenantId: tenant.id, email, kind: 'internal' } }),
  );
  return user.id;
}

async function runInvitation(userId: string): Promise<void> {
  const id = await jobs.add(JOBS.accountEmail, {
    tenantId: tenant.id,
    userId: null,
    accountUserId: userId,
    purpose: 'invitation',
    correlationId: uuidv7(),
  });
  await (await queue.getJob(id))?.waitUntilFinished(events, 30_000);
}

describe('correo de invitación', () => {
  it('llega a la bandeja con un enlace cuya huella quedó guardada en la base', async () => {
    const email = `invitada-${uuidv7()}@pruebas.test`;
    const userId = await invitedUser(email);
    await runInvitation(userId);
    const text = await mailTextTo('Invitación a ARZA ONE', email);
    const token = /\/activar-cuenta#token=([\w-]{43})/.exec(text)?.[1] ?? '';
    expect(token).toHaveLength(43);
    const stored = await database.withTenant({ tenantId: tenant.id, userId: null }, (tx) =>
      tx.token.findMany({ where: { userId, purpose: 'invitation' } }),
    );
    expect(stored.map((row) => row.tokenHash)).toEqual([
      createHash('sha256').update(token).digest('hex'),
    ]);
  });
});

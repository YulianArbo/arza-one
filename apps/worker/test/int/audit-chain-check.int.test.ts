import type { INestApplicationContext } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { DatabaseService, QUEUES, systemClock } from '@arza/api/platform';
import { Queue } from 'bullmq';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { processAuditChainCheck } from '../../src/jobs/audit-chain-check.js';
import { WorkerModule } from '../../src/worker.module.js';
import { createTenant, workerConfig, type TestTenant } from './support/services.js';

// Verificación diaria de la cadena de la auditoría (B11, ficha 17.20).

const config = workerConfig(7);
let app: INestApplicationContext;
let fixtures: DatabaseService;
let database: DatabaseService;
let tenant: TestTenant;
let queue: Queue;

beforeAll(async () => {
  fixtures = new DatabaseService(config.DATABASE_URL, { requireAudit: false });
  // Como el worker: exige la auditoría de cada transacción que escribe.
  database = new DatabaseService(config.DATABASE_URL);
  tenant = await createTenant(fixtures, 'Verificación diaria');
  queue = new Queue(QUEUES.platform, { connection: { url: config.VALKEY_URL } });
  app = await NestFactory.createApplicationContext(WorkerModule.forRoot(config), { logger: false });
  await app.init();
});

afterAll(async () => {
  await app.close();
  await Promise.all([queue.close(), fixtures.onModuleDestroy(), database.onModuleDestroy()]);
});

describe('verificación diaria de la auditoría', () => {
  it('el worker la programa a las 3:00 de la madrugada, hora de Bogotá', async () => {
    await expect
      .poll(async () => queue.getJobSchedulers(), { timeout: 10_000 })
      .toEqual([
        expect.objectContaining({
          key: 'audit.chain-check.daily',
          pattern: '0 3 * * *',
          tz: 'America/Bogota',
        }),
      ]);
  });

  it('verifica cada empresa y deja la verificación en su auditoría', async () => {
    expect(await processAuditChainCheck({ database, clock: systemClock })).toBeGreaterThan(0);
    const events = await fixtures.withTenant({ tenantId: tenant.id, userId: null }, (tx) =>
      tx.auditEvent.findMany({ where: { action: 'audit.chain.verify' } }),
    );
    expect(events).toEqual([expect.objectContaining({ actorKind: 'system', result: 'success' })]);
  });
});

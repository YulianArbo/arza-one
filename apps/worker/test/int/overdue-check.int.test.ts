import type { INestApplicationContext } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import {
  DatabaseService,
  QUEUES,
  SCHEDULED_JOBS,
  type TenantTransaction,
} from '@arza/api/platform';
import { startWorkflow } from '@arza/api/wf';
import { Queue } from 'bullmq';
import { v7 as uuidv7 } from 'uuid';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { processOverdueCheck } from '../../src/jobs/overdue-check.js';
import { WorkerModule } from '../../src/worker.module.js';
import { createTenant, workerConfig, type TestTenant } from './support/services.js';

// Escalamiento de las tareas vencidas (B15, ficha 17.5): el worker lo programa cada 15 minutos y
// cada tarea vencida queda «vencida», escalada y en la auditoría a nombre del sistema.

const config = workerConfig(8);
const KEY = 'worker.overdue';
let app: INestApplicationContext;
let fixtures: DatabaseService;
let database: DatabaseService;
let tenant: TestTenant;
let queue: Queue;

/** Flujo mínimo publicado: un borrador con plazo de una hora hábil y un estado final. */
async function publishFlow(tx: TenantTransaction): Promise<void> {
  const definition = await tx.workflowDefinition.create({
    data: {
      tenantId: tenant.id,
      key: KEY,
      versionNumber: 1,
      name: 'Vencimientos',
      entityType: KEY,
    },
  });
  const owner = { tenantId: tenant.id, definitionId: definition.id };
  await tx.workflowState.createMany({
    data: [
      {
        ...owner,
        position: 0,
        key: 'draft',
        label: 'Borrador',
        kind: 'initial',
        slaHours: 1,
        assignee: { type: 'initiator' },
      },
      { ...owner, position: 1, key: 'done', label: 'Hecha', kind: 'final' },
    ],
  });
  await tx.workflowTransition.create({
    data: {
      ...owner,
      position: 0,
      fromState: 'draft',
      toState: 'done',
      action: 'finish',
      label: 'Terminar',
    },
  });
  await tx.workflowDefinition.update({
    where: { id: definition.id },
    data: { status: 'published', publishedAt: new Date() },
  });
}

beforeAll(async () => {
  fixtures = new DatabaseService(config.DATABASE_URL, { requireAudit: false });
  // Como el worker: exige la auditoría de cada transacción que escribe.
  database = new DatabaseService(config.DATABASE_URL);
  tenant = await createTenant(fixtures, 'Vencimientos');
  await fixtures.withTenant({ tenantId: tenant.id, userId: null }, publishFlow);
  queue = new Queue(QUEUES.platform, { connection: { url: config.VALKEY_URL } });
  app = await NestFactory.createApplicationContext(WorkerModule.forRoot(config), { logger: false });
  await app.init();
});

afterAll(async () => {
  await app.close();
  await Promise.all([queue.close(), fixtures.onModuleDestroy(), database.onModuleDestroy()]);
});

describe('escalamiento de tareas vencidas', () => {
  it('el worker lo programa cada 15 minutos, hora de Bogotá', async () => {
    await expect
      .poll(async () => queue.getJobSchedulers(), { timeout: 10_000 })
      .toContainEqual(
        expect.objectContaining({
          key: 'wf.overdue-check.quarter-hour',
          pattern: '*/15 * * * *',
          tz: 'America/Bogota',
        }),
      );
  });

  it('programa exactamente los trabajos de la plataforma, ni uno más', async () => {
    const keys = async () =>
      (await queue.getJobSchedulers()).map((scheduler) => scheduler.key).sort();
    await expect
      .poll(keys, { timeout: 10_000 })
      .toEqual(SCHEDULED_JOBS.map((job) => job.id).sort());
  });
});

describe('una tarea vencida', () => {
  it('marca la tarea vencida, la escala una sola vez y lo deja en la auditoría', async () => {
    const requester = uuidv7();
    const context = { tenantId: tenant.id, userId: requester, meta: null, at: new Date() };
    const instance = await database.withTenant({ tenantId: tenant.id, userId: requester }, (tx) =>
      startWorkflow(tx, context, {
        key: KEY,
        entityType: KEY,
        entityId: uuidv7(),
        title: 'Vence',
        facts: {},
      }),
    );
    const later = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
    const deps = { database, clock: { now: () => later } };
    expect(await processOverdueCheck(deps)).toBeGreaterThan(0);
    await processOverdueCheck(deps);
    const inTenant = <T>(work: (tx: TenantTransaction) => Promise<T>) =>
      fixtures.withTenant({ tenantId: tenant.id, userId: null }, work);
    const task = await inTenant((tx) =>
      tx.workflowTask.findFirstOrThrow({ where: { instanceId: instance.id } }),
    );
    expect(task).toMatchObject({ status: 'overdue', escalatedAt: later, escalatedToId: null });
    const events = await inTenant((tx) =>
      tx.auditEvent.findMany({ where: { entityId: task.id, action: 'wf.task.escalate' } }),
    );
    expect(events).toEqual([expect.objectContaining({ actorKind: 'system', result: 'success' })]);
  });
});

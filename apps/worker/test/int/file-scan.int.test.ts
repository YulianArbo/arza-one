import { createHash } from 'node:crypto';
import { Readable } from 'node:stream';

import type { INestApplicationContext } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { fileStorageFrom } from '@arza/api/doc';
import { DatabaseService, JOBS, JobQueue, QUEUES } from '@arza/api/platform';
import { Queue, QueueEvents } from 'bullmq';
import { v7 as uuidv7 } from 'uuid';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { WorkerModule } from '../../src/worker.module.js';
import { createTenant, workerConfig, type TestTenant } from './support/services.js';

// El worker completo analiza un archivo recién subido (B14) con Garage y ClamAV reales.

const config = workerConfig(8);
const connection = { url: config.VALKEY_URL };
const storage = fileStorageFrom(config);
let app: INestApplicationContext;
let database: DatabaseService;
let tenant: TestTenant;
let jobs: JobQueue;
let queue: Queue;
let events: QueueEvents;

beforeAll(async () => {
  // Prepara los datos de prueba directamente; el worker bajo prueba sí exige la auditoría.
  database = new DatabaseService(config.DATABASE_URL, { requireAudit: false });
  tenant = await createTenant(database, `Archivos ${uuidv7().slice(-6)}`);
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

/** Un archivo ya subido al almacenamiento y marcado «en análisis», como lo deja la API. */
async function uploadedFile(content: Buffer): Promise<string> {
  const id = uuidv7();
  const key = `${tenant.id}/${id}`;
  await storage.put(
    { key, contentType: 'application/pdf', sizeBytes: content.length },
    Readable.from(content),
  );
  await database.withTenant({ tenantId: tenant.id, userId: null }, (tx) =>
    tx.file.create({
      data: {
        id,
        tenantId: tenant.id,
        storageKey: key,
        fileName: 'acta.pdf',
        mimeType: 'application/pdf',
        sizeBytes: content.length,
        scanStatus: 'scanning',
      },
    }),
  );
  return id;
}

describe('worker: análisis de archivos', () => {
  it('deja disponible un PDF limpio con su huella', async () => {
    const content = Buffer.from(`%PDF-1.7\n% acta ${uuidv7()}\n`);
    const fileId = await uploadedFile(content);
    const jobId = await jobs.add(JOBS.fileScan, {
      tenantId: tenant.id,
      userId: null,
      correlationId: uuidv7(),
      fileId,
    });
    await (await queue.getJob(jobId))?.waitUntilFinished(events, 30_000);
    const file = await database.withTenant({ tenantId: tenant.id, userId: null }, (tx) =>
      tx.file.findUniqueOrThrow({ where: { id: fileId } }),
    );
    expect(file.scanStatus).toBe('available');
    expect(file.sha256).toBe(createHash('sha256').update(content).digest('hex'));
  });
});

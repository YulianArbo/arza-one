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
import { sampleDocx } from './support/sample-docx.js';
import { createTenant, workerConfig, type TestTenant } from './support/services.js';

// El worker completo convierte a PDF el Word de una versión (B18) con Gotenberg y Garage reales.

const WORD = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
const config = workerConfig(10);
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
  tenant = await createTenant(database, `Documentos ${uuidv7().slice(-6)}`);
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

/** Un Word ya subido y analizado, como lo deja la API. */
async function storedWord(content: Buffer): Promise<string> {
  const fileId = uuidv7();
  const key = `${tenant.id}/${fileId}`;
  await storage.put({ key, contentType: WORD, sizeBytes: content.length }, Readable.from(content));
  const sha256 = createHash('sha256').update(content).digest('hex');
  await database.withTenant({ tenantId: tenant.id, userId: null }, (tx) =>
    tx.file.create({
      data: {
        id: fileId,
        tenantId: tenant.id,
        storageKey: key,
        fileName: 'Procedimiento.docx',
        mimeType: WORD,
        sizeBytes: content.length,
        sha256,
        scanStatus: 'available',
        scannedAt: new Date(),
      },
    }),
  );
  return fileId;
}

/** Un documento con su versión en borrador esperando el PDF del Word. */
async function pendingVersion(content: Buffer): Promise<string> {
  const fileId = await storedWord(content);
  return database.withTenant({ tenantId: tenant.id, userId: null }, async (tx) => {
    const folder = await tx.docFolder.create({ data: { tenantId: tenant.id, name: 'Pruebas' } });
    const document = await tx.docDocument.create({
      data: {
        tenantId: tenant.id,
        folderId: folder.id,
        code: `DOC-2026-${String(Date.now()).slice(-4)}`,
        title: 'Procedimiento de prueba',
        docType: 'PR',
        classification: 'internal',
        isControlled: false,
      },
    });
    const version = await tx.docVersion.create({
      data: {
        tenantId: tenant.id,
        documentId: document.id,
        number: 0,
        versionLabel: '00',
        sourceFileId: fileId,
        title: document.title,
        classification: 'internal',
        changeSummary: 'Creación',
      },
    });
    return version.id;
  });
}

describe('worker: conversión de versiones a PDF', () => {
  it('convierte un Word con Gotenberg y guarda el PDF con su huella', async () => {
    const versionId = await pendingVersion(sampleDocx());
    const jobId = await jobs.add(JOBS.versionRender, {
      tenantId: tenant.id,
      userId: null,
      correlationId: uuidv7(),
      versionId,
    });
    await (await queue.getJob(jobId))?.waitUntilFinished(events, 120_000);
    const version = await database.withTenant({ tenantId: tenant.id, userId: null }, (tx) =>
      tx.docVersion.findUniqueOrThrow({ where: { id: versionId }, include: { pdfFile: true } }),
    );
    expect(version.renderStatus).toBe('ready');
    expect(version.pdfFile?.mimeType).toBe('application/pdf');
    const pdf = await storage.read(version.pdfFile?.storageKey ?? '');
    expect(pdf.subarray(0, 5).toString()).toBe('%PDF-');
    expect(version.pdfFile?.sha256).toBe(createHash('sha256').update(pdf).digest('hex'));
  }, 150_000);
});

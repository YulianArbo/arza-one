import { createHash } from 'node:crypto';
import { Readable } from 'node:stream';

import type { INestApplicationContext } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { fileStorageFrom, seedDocForms } from '@arza/api/doc';
import { DatabaseService, JOBS, JobQueue, QUEUES, systemClock } from '@arza/api/platform';
import { Queue, QueueEvents } from 'bullmq';
import { v7 as uuidv7 } from 'uuid';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { WorkerModule } from '../../src/worker.module.js';
import { pdfPages } from './support/pdf-text.js';
import { createTenant, workerConfig, type TestTenant } from './support/services.js';

// El worker completo genera los PDF de los formatos digitales (B20) con Gotenberg y Garage reales.
// Criterio del bloque: el PDF generado reproduce el encabezado y el pie de la plantilla
// institucional. Se comprueba leyendo el texto del PDF, en cada página.

const config = workerConfig(11);
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
  tenant = await createTenant(database, `Formatos ${uuidv7().slice(-6)}`);
  await seedDocForms(database, [tenant.id], systemClock);
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

const scope = () => ({ tenantId: tenant.id, userId: null });

/** Muchas filas, para que el acta ocupe más de una hoja. */
const REQUIREMENTS = Array.from({ length: 60 }, (_, index) => ({
  requisito: `Requisito ficticio número ${String(index + 1)}`,
  tipo: 'Técnico',
  capacidad: 'Sí',
}));

/** Un registro del FT-COM-002 terminado, esperando su PDF, como lo deja la API. */
async function completedRecord(): Promise<string> {
  return database.withTenant(scope(), async (tx) => {
    const template = await tx.docFormTemplate.findFirstOrThrow({
      where: { code: 'FT-COM-002', status: 'published' },
    });
    const now = new Date();
    const record = await tx.docFormRecord.create({
      data: {
        tenantId: tenant.id,
        templateId: template.id,
        templateVersion: template.formVersion,
        code: `FT-COM-002-2026-${String(Date.now()).slice(-4)}`,
        data: {
          cliente: 'Cliente Ficticio S.A.S.',
          oportunidad: 'Portal de autogestión',
          fecha: '2026-10-18',
          requisitos: REQUIREMENTS,
          decision: 'Viable',
        },
        status: 'completed',
        submittedAt: now,
        completedAt: now,
        renderStatus: 'pending',
      },
    });
    return record.id;
  });
}

async function runRender(): Promise<void> {
  const jobId = await jobs.add(JOBS.docPdfRender, {});
  await (await queue.getJob(jobId))?.waitUntilFinished(events, 120_000);
}

async function readPdf(fileId: string | null): Promise<Buffer> {
  const file = await database.withTenant(scope(), (tx) =>
    tx.file.findUniqueOrThrow({ where: { id: fileId ?? '' } }),
  );
  const content = await storage.read(file.storageKey);
  expect(file.sha256).toBe(createHash('sha256').update(content).digest('hex'));
  return content;
}

describe('worker: PDF de los formatos diligenciados', () => {
  it('cada hoja del PDF reproduce el encabezado y el pie de la plantilla institucional', async () => {
    const recordId = await completedRecord();
    await runRender();
    const record = await database.withTenant(scope(), (tx) =>
      tx.docFormRecord.findUniqueOrThrow({ where: { id: recordId } }),
    );
    expect(record.renderStatus).toBe('ready');
    const pages = await pdfPages(await readPdf(record.pdfFileId));
    expect(pages.length).toBeGreaterThan(1);
    pages.forEach((text, index) => {
      // Encabezado: sistema, nombre del formato, código, versión, fecha y página.
      expect(text).toContain('SISTEMA DE GESTIÓN DE CALIDAD');
      expect(text).toContain('Acta de Revisión de Requisitos y Arranque');
      expect(text).toContain('Código: FT-COM-002');
      expect(text).toContain('Versión: 01');
      expect(text).toMatch(/Fecha: \d{2}\/\d{2}\/\d{4}/u);
      expect(text).toContain(`Página: ${String(index + 1)} de ${String(pages.length)}`);
      // Pie: empresa, NIT, código del registro y leyenda.
      expect(text).toContain(`${tenant.legalName} · NIT`);
      expect(text).toContain(record.code);
      expect(text).toContain('Copia no controlada cuando se imprime');
    });
    expect(pages.join(' ')).toContain('Cliente Ficticio S.A.S.');
    expect(pages.join(' ')).toContain('18/10/2026');
  }, 150_000);
});

/** Un PDF real generado por Gotenberg, guardado como lo deja el análisis de archivos. */
async function generatedPdf(): Promise<string> {
  const pdfId = uuidv7();
  const key = `${tenant.id}/${pdfId}`;
  const html = Buffer.from('<html><body><h1>Procedimiento de prueba</h1></body></html>');
  const form = new FormData();
  form.append('files', new Blob([new Uint8Array(html)], { type: 'text/html' }), 'index.html');
  const url = new URL('forms/chromium/convert/html', `${config.GOTENBERG_URL}/`);
  const content = Buffer.from(
    await (await fetch(url, { method: 'POST', body: form })).arrayBuffer(),
  );
  const object = { key, contentType: 'application/pdf', sizeBytes: content.length };
  await storage.put(object, Readable.from(content));
  await database.withTenant(scope(), (tx) =>
    tx.file.create({
      data: {
        id: pdfId,
        tenantId: tenant.id,
        storageKey: key,
        fileName: 'PR-SGC-001.pdf',
        mimeType: 'application/pdf',
        sizeBytes: content.length,
        sha256: createHash('sha256').update(content).digest('hex'),
        scanStatus: 'available',
        scannedAt: new Date(),
      },
    }),
  );
  return pdfId;
}

const PUBLISHED = new Date('2026-10-01T15:00:00Z');

/** Un documento vigente de la carga inicial, versión 03 desde el 01/10/2026, con ese PDF. */
async function currentVersion(pdfId: string): Promise<string> {
  return database.withTenant(scope(), async (tx) => {
    const folder = await tx.docFolder.create({ data: { tenantId: tenant.id, name: 'SGC' } });
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
        number: 3,
        versionLabel: '03',
        status: 'current',
        origin: 'import',
        sourceFileId: pdfId,
        pdfFileId: pdfId,
        renderStatus: 'ready',
        title: document.title,
        classification: 'internal',
        changeSummary: 'Carga inicial',
        submittedAt: PUBLISHED,
        approvedAt: PUBLISHED,
        effectiveDate: new Date('2026-10-01'),
        publishedAt: PUBLISHED,
      },
    });
    return version.id;
  });
}

describe('worker: copia de consulta de la versión vigente', () => {
  it('estampa el pie con el código, la versión, la fecha y la leyenda; el original no cambia', async () => {
    const versionId = await currentVersion(await generatedPdf());
    await runRender();
    const version = await database.withTenant(scope(), (tx) =>
      tx.docVersion.findUniqueOrThrow({ where: { id: versionId }, include: { document: true } }),
    );
    expect(version.copyFileId).not.toBeNull();
    const [copy] = await pdfPages(await readPdf(version.copyFileId));
    expect(copy).toContain(
      `${version.document.code} · Versión 03 · Vigente desde 01/10/2026 · Copia no controlada cuando se imprime`,
    );
    const [original] = await pdfPages(await readPdf(version.pdfFileId));
    expect(original).not.toContain('Copia no controlada');
  }, 150_000);
});

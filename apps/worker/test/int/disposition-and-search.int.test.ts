import { createHash } from 'node:crypto';
import { Readable } from 'node:stream';

import type { INestApplicationContext } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { fileStorageFrom } from '@arza/api/doc';
import {
  DatabaseService,
  JOBS,
  JobQueue,
  QUEUES,
  type JobDefinition,
  type TenantTransaction,
} from '@arza/api/platform';
import { Queue, QueueEvents } from 'bullmq';
import { v7 as uuidv7 } from 'uuid';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { WorkerModule } from '../../src/worker.module.js';
import { pdfPages } from './support/pdf-text.js';
import { createTenant, workerConfig, type TestTenant } from './support/services.js';

// El worker completo con Gotenberg y Garage reales (B21): ejecuta una propuesta de disposición
// aprobada (borra el contenido y genera el acta con el encabezado institucional) y extrae el texto
// de un PDF real para la búsqueda.

const config = workerConfig(12);
const connection = { url: config.VALKEY_URL };
const storage = fileStorageFrom(config);
const YEAR = 365.25 * 24 * 60 * 60 * 1000;
let app: INestApplicationContext;
let database: DatabaseService;
let tenant: TestTenant;
let jobs: JobQueue;
let queue: Queue;
let events: QueueEvents;

beforeAll(async () => {
  // Prepara los datos de prueba directamente; el worker bajo prueba sí exige la auditoría.
  database = new DatabaseService(config.DATABASE_URL, { requireAudit: false });
  tenant = await createTenant(database, `Disposición ${uuidv7().slice(-6)}`);
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

async function run(job: JobDefinition): Promise<void> {
  const jobId = await jobs.add(job, {});
  await (await queue.getJob(jobId))?.waitUntilFinished(events, 120_000);
}

/** Un PDF real generado por Gotenberg con el texto dado, guardado como lo deja el análisis. */
async function storedPdf(text: string): Promise<{ id: string; key: string }> {
  const id = uuidv7();
  const key = `${tenant.id}/${id}`;
  const html = Buffer.from(`<html><body><p>${text}</p></body></html>`);
  const form = new FormData();
  form.append('files', new Blob([new Uint8Array(html)], { type: 'text/html' }), 'index.html');
  const url = new URL('forms/chromium/convert/html', `${config.GOTENBERG_URL}/`);
  const content = Buffer.from(
    await (await fetch(url, { method: 'POST', body: form })).arrayBuffer(),
  );
  await storage.put(
    { key, contentType: 'application/pdf', sizeBytes: content.length },
    Readable.from(content),
  );
  await database.withTenant(scope(), (tx) =>
    tx.file.create({
      data: {
        id,
        tenantId: tenant.id,
        storageKey: key,
        fileName: 'documento.pdf',
        mimeType: 'application/pdf',
        sizeBytes: content.length,
        sha256: createHash('sha256').update(content).digest('hex'),
        scanStatus: 'available',
        scannedAt: new Date(),
      },
    }),
  );
  return { id, key };
}

/** Un documento de expediente en borrador, en su propia carpeta. */
async function caseDocument(tx: TenantTransaction): Promise<{ id: string; title: string }> {
  const folder = await tx.docFolder.create({ data: { tenantId: tenant.id, name: 'Expediente' } });
  return tx.docDocument.create({
    data: {
      tenantId: tenant.id,
      folderId: folder.id,
      code: `DOC-2015-${String(Math.floor(Math.random() * 9000) + 1000)}`,
      title: 'Contrato de prueba',
      docType: 'CT',
      classification: 'internal',
      isControlled: false,
    },
  });
}

/** Un documento de expediente de la carga inicial con ese PDF; obsoleto si se indica la fecha. */
async function importedDocument(pdfId: string, obsoletedAt: Date | null): Promise<string> {
  return database.withTenant(scope(), async (tx) => {
    const document = await caseDocument(tx);
    const published = obsoletedAt ?? new Date();
    const version = await tx.docVersion.create({
      data: {
        tenantId: tenant.id,
        documentId: document.id,
        number: 0,
        versionLabel: '00',
        status: 'current',
        origin: 'import',
        sourceFileId: pdfId,
        pdfFileId: pdfId,
        renderStatus: 'ready',
        title: document.title,
        classification: 'internal',
        changeSummary: 'Carga inicial',
        submittedAt: published,
        approvedAt: published,
        effectiveDate: published,
        publishedAt: published,
      },
    });
    await tx.docDocument.update({
      where: { id: document.id },
      data: { status: 'current', currentVersionId: version.id },
    });
    return document.id;
  });
}

/** Una propuesta aprobada, por otra persona distinta de quien la envió, con ese documento. */
async function approvedProposal(documentId: string): Promise<string> {
  return database.withTenant(scope(), async (tx) => {
    const rule = await tx.docRetentionRule.create({
      data: {
        tenantId: tenant.id,
        code: `CT-${String(Math.floor(Math.random() * 1000))}`,
        name: 'Contratos con clientes',
        docType: 'CT',
        activeYears: 2,
        archiveYears: 3,
        disposition: 'destroy',
        legalBasis: 'Ley 962 de 2005, art. 28',
      },
    });
    const proposal = await tx.docDispositionProposal.create({
      data: { tenantId: tenant.id, code: 'DIS-2026-0001', period: new Date('2026-10-01') },
    });
    await tx.docDisposition.create({
      data: {
        tenantId: tenant.id,
        proposalId: proposal.id,
        documentId,
        retentionRuleId: rule.id,
        dueOn: new Date('2025-01-01'),
      },
    });
    const now = new Date();
    await tx.docDispositionProposal.update({
      where: { id: proposal.id },
      data: { status: 'in_approval', sentBy: uuidv7(), sentAt: now },
    });
    await tx.docDispositionProposal.update({
      where: { id: proposal.id },
      data: { status: 'approved', decidedBy: uuidv7(), decidedAt: now },
    });
    return proposal.id;
  });
}

describe('worker: ejecución de la disposición final', () => {
  it('borra el contenido del documento y deja el acta con el encabezado institucional', async () => {
    const pdf = await storedPdf('Contrato vencido de prueba');
    const documentId = await importedDocument(pdf.id, new Date(Date.now() - 10 * YEAR));
    const proposalId = await approvedProposal(documentId);
    await run(JOBS.docDispositionExecute);
    const proposal = await database.withTenant(scope(), (tx) =>
      tx.docDispositionProposal.findUniqueOrThrow({
        where: { id: proposalId },
        include: { certificateFile: true },
      }),
    );
    expect(proposal.status).toBe('executed');
    await expect(storage.read(pdf.key)).rejects.toThrow();
    const document = await database.withTenant(scope(), (tx) =>
      tx.docDocument.findUniqueOrThrow({ where: { id: documentId } }),
    );
    expect(document.status).toBe('disposed');
    const [page] = await pdfPages(await storage.read(proposal.certificateFile?.storageKey ?? ''));
    expect(page).toContain('Acta de disposición final de documentos');
    expect(page).toContain('Código: RE-SGC-005');
    expect(page).toContain('DIS-2026-0001 · octubre de 2026');
    expect(page).toContain(document.code);
    expect(page).toContain('Documentos eliminados (1)');
    expect(page).toContain(`${tenant.legalName} · NIT`);
  }, 150_000);
});

describe('worker: texto de las versiones para la búsqueda', () => {
  it('guarda el texto del PDF vigente, que la base de datos indexa sin tildes', async () => {
    const pdf = await storedPdf('Política de Gestión Documental');
    const documentId = await importedDocument(pdf.id, null);
    await run(JOBS.docTextExtract);
    const text = await database.withTenant(scope(), (tx) =>
      tx.docVersionText.findFirstOrThrow({ where: { documentId } }),
    );
    expect(text.status).toBe('ready');
    expect(text.content).toContain('Política de Gestión Documental');
    const matched = await database.withTenant(
      scope(),
      (tx) =>
        tx.$queryRaw<{ found: boolean }[]>`
        SELECT to_tsvector('doc_spanish', content) @@ to_tsquery('doc_spanish', 'gestion:*') AS found
        FROM doc_version_texts WHERE id = ${text.id}::uuid`,
    );
    expect(matched[0]?.found).toBe(true);
  }, 150_000);
});

import {
  DatabaseService,
  JOBS,
  JobQueue,
  QUEUES,
  systemClock,
  type ExampleEmailJob,
} from '@arza/api/platform';
import { fileStorageFrom } from '@arza/api/doc';
import { Queue, QueueEvents } from 'bullmq';
import { pino } from 'pino';
import { v7 as uuidv7 } from 'uuid';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

import type { MailMessage } from '../../src/mail/mailer.js';
import { createJobRouter } from '../../src/queue/job-router.js';
import { startQueueWorkers, type QueueWorkers } from '../../src/queue/queue-workers.js';
import { createTenant, workerConfig, type TestTenant } from './support/services.js';

// Criterio de aceptación de B06 (ADR-014): el trabajo de ejemplo se reintenta al fallar.
// El correo falla a propósito en los primeros intentos; la política de reintentos es la real.

const config = workerConfig(2);
const connection = { url: config.VALKEY_URL };
let database: DatabaseService;
let tenant: TestTenant;
let jobs: JobQueue;
let queue: Queue;
let events: QueueEvents;
let workers: QueueWorkers;
/** Intentos de envío que todavía deben fallar. */
let failuresLeft = 0;
const sent: MailMessage[] = [];
const report = vi.fn();

const flakyMailer = {
  send: async (message: MailMessage): Promise<void> => {
    if (failuresLeft > 0) {
      failuresLeft -= 1;
      throw new Error('SMTP sin respuesta (simulado)');
    }
    sent.push(message);
    return Promise.resolve();
  },
  sendWithId: async () => Promise.reject(new Error('no se usa en esta prueba')),
};

beforeAll(async () => {
  // Prepara los datos de prueba directamente; el worker bajo prueba sí exige la auditoría.
  database = new DatabaseService(config.DATABASE_URL, { requireAudit: false });
  tenant = await createTenant(database, 'Reintentos');
  jobs = new JobQueue(connection);
  queue = new Queue(QUEUES.platform, { connection });
  events = new QueueEvents(QUEUES.platform, { connection });
  await events.waitUntilReady();
  const router = createJobRouter({
    database,
    mailer: flakyMailer,
    clock: systemClock,
    appUrl: config.APP_URL,
    storage: fileStorageFrom(config),
    antivirus: async () => Promise.reject(new Error('no se usa en esta prueba')),
    convert: async () => Promise.reject(new Error('no se usa en esta prueba')),
    convertOffice: async () => Promise.reject(new Error('no se usa en esta prueba')),
    convertHtml: async () => Promise.reject(new Error('no se usa en esta prueba')),
    stamp: async () => Promise.reject(new Error('no se usa en esta prueba')),
    mergePdfs: async () => Promise.reject(new Error('no se usa en esta prueba')),
    pdfSeal: {
      certificateSha256: '0'.repeat(64),
      holder: 'no se usa en esta prueba',
      seal: async () => Promise.reject(new Error('no se usa en esta prueba')),
    },
    extractText: async () => Promise.reject(new Error('no se usa en esta prueba')),
  });
  workers = startQueueWorkers(router, {
    connection: { ...connection, maxRetriesPerRequest: null },
    concurrency: 1,
    logger: pino({ level: 'silent' }),
    reporter: { report },
  });
});

afterAll(async () => {
  await workers.stop(5000);
  await Promise.all([jobs.close(), queue.close(), events.close(), database.onModuleDestroy()]);
});

function payload(): ExampleEmailJob {
  return {
    tenantId: tenant.id,
    userId: null,
    correlationId: uuidv7(),
    recipient: 'a@arza-one.test',
  };
}

describe('reintentos del trabajo de ejemplo', () => {
  it('si el correo falla, se reintenta solo con la política real y termina bien', async () => {
    report.mockClear();
    failuresLeft = 1;
    const started = Date.now();
    const id = await jobs.add(JOBS.exampleEmail, payload());
    await (await queue.getJob(id))?.waitUntilFinished(events, 30_000);
    const job = await queue.getJob(id);
    expect(await job?.getState()).toBe('completed');
    // Primer intento fallido, segundo exitoso, tras la espera de 5 segundos de la política.
    expect(job?.attemptsMade).toBe(2);
    expect(Date.now() - started).toBeGreaterThanOrEqual(4900);
    expect(sent.at(-1)?.subject).toContain('Reintentos');
    expect(report).not.toHaveBeenCalled();
  });

  it('agotados los intentos, el trabajo queda fallido para revisión', async () => {
    report.mockClear();
    failuresLeft = 10;
    const data = payload();
    // Política corta solo en esta prueba: dos intentos, 100 ms de espera.
    const job = await queue.add(JOBS.exampleEmail.name, data, {
      attempts: 2,
      backoff: { type: 'fixed', delay: 100 },
    });
    await expect(job.waitUntilFinished(events, 30_000)).rejects.toThrow('SMTP sin respuesta');
    const finished = await queue.getJob(job.id ?? '');
    expect(await finished?.getState()).toBe('failed');
    expect(finished?.attemptsMade).toBe(2);
    await vi.waitFor(() => {
      expect(report).toHaveBeenCalledExactlyOnceWith(expect.any(Error), {
        where: `trabajo ${job.name}`,
        correlationId: data.correlationId,
      });
    });
    failuresLeft = 0;
  });

  it('reporta un trabajo inválido aunque no tenga identificador de correlación', async () => {
    report.mockClear();
    const job = await queue.add(JOBS.exampleEmail.name, {}, { attempts: 1 });
    await expect(job.waitUntilFinished(events, 30_000)).rejects.toThrow();
    await vi.waitFor(() => {
      expect(report).toHaveBeenCalledExactlyOnceWith(expect.any(Error), {
        where: `trabajo ${job.name}`,
      });
    });
  });
});

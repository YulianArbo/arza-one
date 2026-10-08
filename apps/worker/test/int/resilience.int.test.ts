import { NestFactory } from '@nestjs/core';
import { JOBS, QUEUES } from '@arza/api/platform';
import { Queue } from 'bullmq';
import { pino } from 'pino';
import { describe, expect, it } from 'vitest';

import { startQueueWorkers } from '../../src/queue/queue-workers.js';
import { WorkerModule } from '../../src/worker.module.js';
import { workerConfig } from './support/services.js';

// Si Valkey rechaza la conexión, el worker no se cae: registra el error, sigue intentando y se
// apaga en orden cuando se le pide.

describe('worker sin acceso a Valkey', () => {
  it('arranca, registra los errores sin detenerse y se apaga en orden', async () => {
    const config = workerConfig(4);
    const wrongPassword = config.VALKEY_URL.replace(/:[^:@/]+@/, ':equivocada@');
    const app = await NestFactory.createApplicationContext(
      WorkerModule.forRoot({ ...config, VALKEY_URL: wrongPassword }),
      { logger: false },
    );
    await app.init();
    // Tiempo para que el latido y las colas intenten conectarse y fallen.
    await new Promise((resolve) => setTimeout(resolve, 1500));
    await expect(app.close()).resolves.toBeUndefined();
  });
});

describe('apagado con un trabajo que no termina', () => {
  it('espera el plazo de gracia, avisa y se apaga igual', async () => {
    const config = workerConfig(5);
    const connection = { url: config.VALKEY_URL };
    const warnings: string[] = [];
    const logger = pino({ level: 'warn' }, { write: (line: string) => warnings.push(line) });
    let started = false;
    const workers = startQueueWorkers(
      async () => {
        started = true;
        // Un trabajo que no termina nunca durante la prueba.
        return new Promise<void>(() => undefined);
      },
      { connection: { ...connection, maxRetriesPerRequest: null }, concurrency: 1, logger },
    );
    const queue = new Queue(QUEUES.platform, { connection });
    await queue.add(JOBS.exampleEmail.name, {});
    await expect.poll(() => started, { timeout: 10_000 }).toBe(true);
    const before = Date.now();
    await workers.stop(300);
    expect(Date.now() - before).toBeGreaterThanOrEqual(300);
    expect(warnings.join('')).toContain('Trabajos sin terminar al apagar');
    await queue.obliterate({ force: true });
    await queue.close();
  });
});

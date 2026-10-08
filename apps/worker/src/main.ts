import 'reflect-metadata';

import { ConfigError } from '@arza/api/platform';

import { loadWorkerConfig } from './config/load-worker-config.js';

async function bootstrap(): Promise<void> {
  const config = loadWorkerConfig(process.env);
  // NestJS, Prisma y BullMQ se cargan solo con la configuración ya validada.
  const { NestFactory } = await import('@nestjs/core');
  const { WorkerModule } = await import('./worker.module.js');
  const app = await NestFactory.createApplicationContext(WorkerModule.forRoot(config), {
    logger: ['error', 'warn'],
  });
  // Al recibir la señal de apagado (Ctrl + C, docker stop), termina los trabajos en curso.
  app.enableShutdownHooks();
}

bootstrap().catch((error: unknown) => {
  const reason = error instanceof ConfigError ? error.message : String(error);
  process.stderr.write(`${reason}\n`);
  process.exitCode = 1;
});

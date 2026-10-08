import { hostname } from 'node:os';

import {
  Inject,
  Injectable,
  Module,
  type DynamicModule,
  type OnApplicationBootstrap,
  type OnApplicationShutdown,
} from '@nestjs/common';
import { DatabaseService, systemClock } from '@arza/api/platform';
import { Redis } from 'ioredis';
import type { Logger } from 'pino';

import type { WorkerEnv } from './config/env-schema.js';
import { startHeartbeat } from './heartbeat/heartbeat.js';
import { createLogger } from './logging/logger.js';
import { SmtpMailer, type Mailer } from './mail/mailer.js';
import { createJobRouter } from './queue/job-router.js';
import { startQueueWorkers, type QueueWorkers } from './queue/queue-workers.js';

const WORKER_CONFIG = Symbol('WORKER_CONFIG');
const LOGGER = Symbol('LOGGER');
const MAILER = Symbol('MAILER');
const VALKEY = Symbol('VALKEY');

/**
 * Tiempo que el worker espera los trabajos en curso al apagarse. El despliegue (B07) debe dar al
 * contenedor un poco más (stop_grace_period de 30 s) antes de detenerlo a la fuerza.
 */
const SHUTDOWN_GRACE_MS = 25_000;

/** Enciende los procesadores de las colas y el latido; los apaga en orden al detenerse. */
@Injectable()
class WorkerRuntime implements OnApplicationBootstrap, OnApplicationShutdown {
  private queueWorkers: QueueWorkers | undefined;
  private stopHeartbeat: (() => void) | undefined;

  constructor(
    @Inject(WORKER_CONFIG) private readonly config: WorkerEnv,
    @Inject(LOGGER) private readonly logger: Logger,
    @Inject(DatabaseService) private readonly database: DatabaseService,
    @Inject(MAILER) private readonly mailer: Mailer,
    @Inject(VALKEY) private readonly valkey: Redis,
  ) {}

  onApplicationBootstrap(): void {
    const router = createJobRouter({
      database: this.database,
      mailer: this.mailer,
      clock: systemClock,
      appUrl: this.config.APP_URL,
    });
    this.queueWorkers = startQueueWorkers(router, {
      // BullMQ exige conexiones sin límite de reintentos por comando para esperar trabajos.
      connection: { url: this.config.VALKEY_URL, maxRetriesPerRequest: null },
      concurrency: this.config.WORKER_CONCURRENCY,
      logger: this.logger,
    });
    this.stopHeartbeat = startHeartbeat(this.valkey, hostname(), (error) => {
      this.logger.warn({ reason: String(error) }, 'No se pudo emitir el latido');
    });
    this.logger.info({ queues: this.queueWorkers.queues }, 'Worker listo');
  }

  /** Espera a que terminen los trabajos en curso antes de cerrar las conexiones. */
  async onApplicationShutdown(): Promise<void> {
    this.stopHeartbeat?.();
    await this.queueWorkers?.stop(SHUTDOWN_GRACE_MS);
    this.mailer.close();
    this.valkey.disconnect();
    this.logger.info('Worker detenido');
  }
}

/** Conexión del latido. Sus errores se registran sin la dirección, que lleva la contraseña. */
function createValkey(config: WorkerEnv, logger: Logger): Redis {
  const client = new Redis(config.VALKEY_URL, { lazyConnect: true });
  client.on('error', (error: Error) => {
    logger.warn({ reason: error.message }, 'Sin conexión con Valkey');
  });
  return client;
}

@Module({})
export class WorkerModule {
  static forRoot(config: WorkerEnv): DynamicModule {
    const logger = createLogger(config);
    return {
      module: WorkerModule,
      providers: [
        { provide: WORKER_CONFIG, useValue: config },
        { provide: LOGGER, useValue: logger },
        { provide: DatabaseService, useValue: new DatabaseService(config.DATABASE_URL) },
        { provide: MAILER, useValue: new SmtpMailer(config) },
        { provide: VALKEY, useValue: createValkey(config, logger) },
        WorkerRuntime,
      ],
    };
  }
}

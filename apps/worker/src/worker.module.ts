import { hostname } from 'node:os';

import {
  Inject,
  Injectable,
  Module,
  type DynamicModule,
  type OnApplicationBootstrap,
  type OnApplicationShutdown,
} from '@nestjs/common';
import {
  convertHtmlWithGotenberg,
  convertWithGotenberg,
  extractPdfText,
  fileStorageFrom,
  mergeWithGotenberg,
  scanWithClamav,
  stampWithGotenberg,
} from '@arza/api/doc';
import {
  DatabaseService,
  JobQueue,
  SCHEDULED_JOBS,
  systemClock,
  type PdfSeal,
} from '@arza/api/platform';
import { Redis } from 'ioredis';
import type { Logger } from 'pino';

import type { WorkerEnv } from './config/env-schema.js';
import { pdfSealFrom } from './config/pdf-seal.js';
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

/** Tiempo máximo del antivirus por archivo (hasta 20 MB). */
const ANTIVIRUS_TIMEOUT_MS = 60_000;

/** Tiempo máximo de Gotenberg para convertir un Word, un Excel o una página HTML a PDF. */
const CONVERSION_TIMEOUT_MS = 120_000;

/** Enciende los procesadores de las colas y el latido; los apaga en orden al detenerse. */
@Injectable()
class WorkerRuntime implements OnApplicationBootstrap, OnApplicationShutdown {
  private queueWorkers: QueueWorkers | undefined;
  private stopHeartbeat: (() => void) | undefined;
  private scheduledJobs: JobQueue | undefined;

  constructor(
    @Inject(WORKER_CONFIG) private readonly config: WorkerEnv,
    @Inject(LOGGER) private readonly logger: Logger,
    @Inject(DatabaseService) private readonly database: DatabaseService,
    @Inject(MAILER) private readonly mailer: Mailer,
    @Inject(VALKEY) private readonly valkey: Redis,
  ) {}

  onApplicationBootstrap(): void {
    const gotenberg = { url: this.config.GOTENBERG_URL, timeoutMs: CONVERSION_TIMEOUT_MS };
    const router = createJobRouter({
      database: this.database,
      mailer: this.mailer,
      clock: systemClock,
      appUrl: this.config.APP_URL,
      storage: fileStorageFrom(this.config),
      antivirus: async (content) =>
        scanWithClamav(
          {
            host: this.config.CLAMAV_HOST,
            port: this.config.CLAMAV_PORT,
            timeoutMs: ANTIVIRUS_TIMEOUT_MS,
          },
          content,
        ),
      convert: async (source) => convertWithGotenberg(gotenberg, source),
      convertOffice: async (source) => convertWithGotenberg(gotenberg, source),
      convertHtml: async (document) => convertHtmlWithGotenberg(gotenberg, document),
      stamp: async (pdf, text) => stampWithGotenberg(gotenberg, pdf, text),
      mergePdfs: async (pdfs) => mergeWithGotenberg(gotenberg, pdfs),
      pdfSeal: this.pdfSeal(),
      extractText: extractPdfText,
    });
    this.queueWorkers = startQueueWorkers(router, {
      // BullMQ exige conexiones sin límite de reintentos por comando para esperar trabajos.
      connection: { url: this.config.VALKEY_URL, maxRetriesPerRequest: null },
      concurrency: this.config.WORKER_CONCURRENCY,
      logger: this.logger,
    });
    this.scheduleJobs();
    this.stopHeartbeat = startHeartbeat(this.valkey, hostname(), (error) => {
      this.logger.warn({ reason: String(error) }, 'No se pudo emitir el latido');
    });
    this.logger.info({ queues: this.queueWorkers.queues }, 'Worker listo');
  }

  /** Sello de los PDF firmados (B43); deja en el registro de quién es el certificado. */
  private pdfSeal(): PdfSeal {
    const seal = pdfSealFrom(this.config, systemClock.now());
    this.logger.info(
      { holder: seal.holder, certificateSha256: seal.certificateSha256 },
      'Sello de los PDF firmados listo',
    );
    return seal;
  }

  /**
   * Registra los trabajos programados, como la verificación diaria de la auditoría. No detiene el
   * arranque: si Valkey no responde, BullMQ lo intenta hasta lograrlo. Repetirlo no los duplica.
   */
  private scheduleJobs(): void {
    const jobs = new JobQueue({ url: this.config.VALKEY_URL });
    this.scheduledJobs = jobs;
    void Promise.all(SCHEDULED_JOBS.map(async (scheduled) => jobs.schedule(scheduled)))
      .then(() => {
        this.logger.info({ jobs: SCHEDULED_JOBS.map((item) => item.id) }, 'Trabajos programados');
      })
      .catch((error: unknown) => {
        this.logger.warn({ reason: String(error) }, 'No se registraron los trabajos programados');
      })
      .finally(() => {
        void jobs.close();
      });
  }

  /** Espera a que terminen los trabajos en curso antes de cerrar las conexiones. */
  async onApplicationShutdown(): Promise<void> {
    this.stopHeartbeat?.();
    await this.queueWorkers?.stop(SHUTDOWN_GRACE_MS);
    // Si Valkey nunca respondió, el registro sigue pendiente: cerrarlo corta sus reintentos.
    await this.scheduledJobs?.close();
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

import { Global, Inject, Injectable, Module, type OnApplicationShutdown } from '@nestjs/common';

import { CONFIG } from '../config/config.module.js';
import type { Env } from '../config/env-schema.js';
import { JobQueue } from './job-queue.js';

@Injectable()
class JobQueueShutdown implements OnApplicationShutdown {
  constructor(@Inject(JobQueue) private readonly queue: JobQueue) {}

  async onApplicationShutdown(): Promise<void> {
    await this.queue.close();
  }
}

/** Pone la cola de trabajos a disposición de toda la API. Se conecta al encolar el primero. */
@Global()
@Module({
  providers: [
    {
      provide: JobQueue,
      useFactory: (config: Env) => new JobQueue({ url: config.VALKEY_URL }),
      inject: [CONFIG],
    },
    JobQueueShutdown,
  ],
  exports: [JobQueue],
})
export class QueueModule {}

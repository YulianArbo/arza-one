// Interfaz pública de la plataforma de la API para el worker (ADR-004): el worker reutiliza estas
// piezas y nunca importa archivos internos. Se publica como «@arza/api/platform».
export { systemClock, type Clock } from './clock/clock.js';
export { ConfigError, loadEnv } from './config/load-config.js';
export { DatabaseService } from './database/database.service.js';
export { DEMO_TENANTS, PLATFORM_TENANT } from './database/seed/seed-data.js';
export type { TenantContext, TenantTransaction } from './database/tenant-context.js';
export { REDACTED_PATHS } from './logging/logging.module.js';
export { JobQueue } from './queues/job-queue.js';
export {
  DEFAULT_JOB_OPTIONS,
  JOBS,
  QUEUES,
  SCHEDULED_JOBS,
  type AccountEmailJob,
  type ExampleEmailJob,
  type FileScanJob,
  type JobDefinition,
  type TenantJob,
} from './queues/jobs.js';

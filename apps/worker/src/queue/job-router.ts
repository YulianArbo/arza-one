import { JOBS } from '@arza/api/platform';
import { UnrecoverableError } from 'bullmq';

import { processAccountEmail, type AccountEmailJobDependencies } from '../jobs/account-email.js';
import {
  processAuditChainCheck,
  type AuditChainCheckDependencies,
} from '../jobs/audit-chain-check.js';
import { processExampleEmail, type ExampleEmailDependencies } from '../jobs/example-email.js';

/** Lo que un procesador necesita saber del trabajo. */
interface IncomingJob {
  readonly name: string;
  readonly data: unknown;
}

export type JobHandler = (job: IncomingJob) => Promise<void>;

export type JobDependencies = ExampleEmailDependencies &
  AccountEmailJobDependencies &
  AuditChainCheckDependencies;

/** Procesadores de cada trabajo, por su nombre. Cada bloque agrega los suyos. */
function handlers(deps: JobDependencies): ReadonlyMap<string, JobHandler> {
  return new Map<string, JobHandler>([
    [JOBS.exampleEmail.name, async (job) => processExampleEmail(job.data, deps)],
    [
      JOBS.accountEmail.name,
      async (job) => {
        await processAccountEmail(job.data, deps);
      },
    ],
    [
      JOBS.auditChainCheck.name,
      async () => {
        await processAuditChainCheck(deps);
      },
    ],
  ]);
}

/** Envía cada trabajo a su procesador. Un nombre desconocido no se reintenta. */
export function createJobRouter(deps: JobDependencies): JobHandler {
  const byName = handlers(deps);
  return async (job) => {
    const handler = byName.get(job.name);
    if (handler === undefined) {
      throw new UnrecoverableError(`No hay procesador para el trabajo «${job.name}».`);
    }
    await handler(job);
  };
}

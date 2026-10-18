import { JOBS } from '@arza/api/platform';
import { UnrecoverableError } from 'bullmq';

import { processAccountEmail, type AccountEmailJobDependencies } from '../jobs/account-email.js';
import {
  processAuditChainCheck,
  type AuditChainCheckDependencies,
} from '../jobs/audit-chain-check.js';
import { processExampleEmail, type ExampleEmailDependencies } from '../jobs/example-email.js';
import { processFileScan, type FileScanJobDependencies } from '../jobs/file-scan.js';
import {
  processNoticeDispatch,
  type NoticeDispatchJobDependencies,
} from '../jobs/notice-dispatch.js';
import { processOverdueCheck, type OverdueCheckJobDependencies } from '../jobs/overdue-check.js';
import { processPdfRender, type PdfRenderJobDependencies } from '../jobs/pdf-render.js';
import { processVersionRender, type VersionRenderJobDependencies } from '../jobs/version-render.js';

/** Lo que un procesador necesita saber del trabajo. */
interface IncomingJob {
  readonly name: string;
  readonly data: unknown;
}

export type JobHandler = (job: IncomingJob) => Promise<void>;

export type JobDependencies = ExampleEmailDependencies &
  AccountEmailJobDependencies &
  AuditChainCheckDependencies &
  FileScanJobDependencies &
  VersionRenderJobDependencies &
  OverdueCheckJobDependencies &
  NoticeDispatchJobDependencies &
  PdfRenderJobDependencies;

/** Procesador que recibe los datos del trabajo; su resultado no se usa. */
function withData(process: (data: unknown) => Promise<unknown>): JobHandler {
  return async (job) => {
    await process(job.data);
  };
}

/** Procesador de un trabajo del sistema, que no lleva datos. */
function withoutData(process: () => Promise<unknown>): JobHandler {
  return async () => {
    await process();
  };
}

/** Procesadores de cada trabajo, por su nombre. Cada bloque agrega los suyos. */
function handlers(deps: JobDependencies): ReadonlyMap<string, JobHandler> {
  return new Map<string, JobHandler>([
    [JOBS.exampleEmail.name, withData(async (data) => processExampleEmail(data, deps))],
    [JOBS.accountEmail.name, withData(async (data) => processAccountEmail(data, deps))],
    [JOBS.auditChainCheck.name, withoutData(async () => processAuditChainCheck(deps))],
    [JOBS.fileScan.name, withData(async (data) => processFileScan(data, deps))],
    [JOBS.versionRender.name, withData(async (data) => processVersionRender(data, deps))],
    [JOBS.wfOverdueCheck.name, withoutData(async () => processOverdueCheck(deps))],
    [JOBS.ntfDispatch.name, withoutData(async () => processNoticeDispatch(deps))],
    [JOBS.docPdfRender.name, withoutData(async () => processPdfRender(deps))],
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

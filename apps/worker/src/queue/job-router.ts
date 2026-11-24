import { JOBS } from '@arza/api/platform';
import { expireRecruitmentData, runHrDailyWork } from '@arza/api/hr';
import { runInnDailyWork } from '@arza/api/inn';
import { renderQualityPdfs, runQmsDailyWork, runQmsIndicatorWork } from '@arza/api/qms';
import { serviceQualityFigures } from '@arza/api/service';
import { runSstDailyWork } from '@arza/api/sst';
import { UnrecoverableError } from 'bullmq';

import {
  processAcceptanceWork,
  type AcceptanceWorkJobDependencies,
} from '../jobs/acceptance-work.js';
import { processLoanWork, type LoanWorkJobDependencies } from '../jobs/loan-work.js';
import { processSlaWork, type SlaWorkJobDependencies } from '../jobs/sla-work.js';
import { processCareWork, type CareWorkJobDependencies } from '../jobs/care-work.js';
import {
  processPrivacyDailyWork,
  processPrivacyWork,
  type PrivacyJobDependencies,
} from '../jobs/privacy-work.js';
import { processSiteWork, type SiteWorkJobDependencies } from '../jobs/site-work.js';
import { processAccountEmail, type AccountEmailJobDependencies } from '../jobs/account-email.js';
import {
  processContractFollowUp,
  processContractPdfs,
  type ContractWorkJobDependencies,
} from '../jobs/contract-work.js';
import {
  processActivityRemind,
  type ActivityRemindJobDependencies,
} from '../jobs/activity-remind.js';
import {
  processAuditChainCheck,
  type AuditChainCheckDependencies,
} from '../jobs/audit-chain-check.js';
import {
  processDispositionExecute,
  type DispositionExecuteJobDependencies,
} from '../jobs/disposition-execute.js';
import {
  processDispositionPropose,
  type DispositionProposeJobDependencies,
} from '../jobs/disposition-propose.js';
import { processExampleEmail, type ExampleEmailDependencies } from '../jobs/example-email.js';
import { processFileScan, type FileScanJobDependencies } from '../jobs/file-scan.js';
import {
  processNoticeDispatch,
  type NoticeDispatchJobDependencies,
} from '../jobs/notice-dispatch.js';
import { processOverdueCheck, type OverdueCheckJobDependencies } from '../jobs/overdue-check.js';
import { processPdfRender, type PdfRenderJobDependencies } from '../jobs/pdf-render.js';
import {
  processSignatureFollowUp,
  processSignatureWork,
  type SignatureWorkJobDependencies,
} from '../jobs/signature-work.js';
import {
  processQuoteExpire,
  processQuoteWork,
  type QuoteWorkJobDependencies,
} from '../jobs/quote-work.js';
import { processTextExtract, type TextExtractJobDependencies } from '../jobs/text-extract.js';
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
  PdfRenderJobDependencies &
  DispositionProposeJobDependencies &
  DispositionExecuteJobDependencies &
  TextExtractJobDependencies &
  ActivityRemindJobDependencies &
  QuoteWorkJobDependencies &
  ContractWorkJobDependencies &
  SignatureWorkJobDependencies &
  AcceptanceWorkJobDependencies &
  LoanWorkJobDependencies &
  SlaWorkJobDependencies &
  CareWorkJobDependencies &
  SiteWorkJobDependencies &
  PrivacyJobDependencies &
  Parameters<typeof renderQualityPdfs>[0];

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

/** Privacidad (B42): correos al titular, PDF de la entrega y trabajo diario. */
function privacyHandlers(deps: JobDependencies): [string, JobHandler][] {
  return [
    [JOBS.prvRequestWork.name, withoutData(async () => processPrivacyWork(deps))],
    [JOBS.prvDailyWork.name, withoutData(async () => processPrivacyDailyWork(deps))],
  ];
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
    [JOBS.docDispositionPropose.name, withoutData(async () => processDispositionPropose(deps))],
    [JOBS.docDispositionExecute.name, withoutData(async () => processDispositionExecute(deps))],
    [JOBS.docTextExtract.name, withoutData(async () => processTextExtract(deps))],
    [JOBS.crmActivityRemind.name, withoutData(async () => processActivityRemind(deps))],
    [JOBS.crmQuoteWork.name, withoutData(async () => processQuoteWork(deps))],
    [JOBS.crmQuoteExpire.name, withoutData(async () => processQuoteExpire(deps))],
    [JOBS.ctrPdfRender.name, withoutData(async () => processContractPdfs(deps))],
    [JOBS.ctrFollowUp.name, withoutData(async () => processContractFollowUp(deps))],
    [JOBS.sigWork.name, withoutData(async () => processSignatureWork(deps))],
    [JOBS.sigFollowUp.name, withoutData(async () => processSignatureFollowUp(deps))],
    [JOBS.prjAcceptanceWork.name, withoutData(async () => processAcceptanceWork(deps))],
    [JOBS.astLoanWork.name, withoutData(async () => processLoanWork(deps))],
    [JOBS.hrRetention.name, withoutData(async () => expireRecruitmentData(deps))],
    [JOBS.hrDailyWork.name, withoutData(async () => runHrDailyWork(deps))],
    [JOBS.sstDailyWork.name, withoutData(async () => runSstDailyWork(deps))],
    [JOBS.qmsDailyWork.name, withoutData(async () => runQmsDailyWork(deps))],
    [
      JOBS.qmsIndicatorWork.name,
      withoutData(async () =>
        runQmsIndicatorWork({ ...deps, serviceFigures: serviceQualityFigures }),
      ),
    ],
    [JOBS.qmsPdfWork.name, withoutData(async () => renderQualityPdfs(deps))],
    [JOBS.innDailyWork.name, withoutData(async () => runInnDailyWork(deps))],
    [JOBS.svcSlaWork.name, withoutData(async () => processSlaWork(deps))],
    [JOBS.svcCareWork.name, withoutData(async () => processCareWork(deps))],
    [JOBS.webSiteWork.name, withoutData(async () => processSiteWork(deps))],
    ...privacyHandlers(deps),
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

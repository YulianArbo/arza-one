import { JOBS } from '@arza/api/platform';
import { UnrecoverableError } from 'bullmq';
import { describe, expect, it } from 'vitest';

import { createJobRouter, type JobDependencies } from './job-router.js';

const unusedDeps: JobDependencies = {
  database: {
    withTenant: async () => Promise.reject(new Error('no se usa')),
    withoutTenant: async () => Promise.reject(new Error('no se usa')),
    withTenantFor: async () => Promise.reject(new Error('no se usa')),
  },
  mailer: {
    send: async () => Promise.reject(new Error('no se usa')),
    sendWithId: async () => Promise.reject(new Error('no se usa')),
  },
  clock: { now: () => new Date() },
  appUrl: 'http://localhost:3000/app',
  storage: {
    read: async () => Promise.reject(new Error('no se usa')),
    put: async () => Promise.reject(new Error('no se usa')),
    delete: async () => Promise.reject(new Error('no se usa')),
    stream: async () => Promise.reject(new Error('no se usa')),
    list: async () => Promise.reject(new Error('no se usa')),
    deletePrefix: async () => Promise.reject(new Error('no se usa')),
  },
  antivirus: async () => Promise.reject(new Error('no se usa')),
  convert: async () => Promise.reject(new Error('no se usa')),
  convertOffice: async () => Promise.reject(new Error('no se usa')),
  convertHtml: async () => Promise.reject(new Error('no se usa')),
  stamp: async () => Promise.reject(new Error('no se usa')),
  mergePdfs: async () => Promise.reject(new Error('no se usa')),
  pdfSeal: {
    certificateSha256: '0'.repeat(64),
    holder: 'no se usa',
    seal: async () => Promise.reject(new Error('no se usa')),
  },
  extractText: async () => Promise.reject(new Error('no se usa')),
};

describe('enrutador de trabajos', () => {
  it('envía el trabajo de ejemplo a su procesador', async () => {
    const route = createJobRouter(unusedDeps);
    // El procesador de ejemplo rechaza estos datos: prueba de que el trabajo llegó a él.
    await expect(route({ name: JOBS.exampleEmail.name, data: {} })).rejects.toThrow(
      'Los datos del trabajo no son válidos',
    );
  });
});

describe('enrutador de trabajos', () => {
  it('envía el correo de una cuenta a su procesador', async () => {
    const route = createJobRouter(unusedDeps);
    await expect(route({ name: JOBS.accountEmail.name, data: {} })).rejects.toThrow(
      'Los datos del trabajo no son válidos',
    );
  });
});

describe('enrutador de trabajos', () => {
  it('envía la verificación diaria de la auditoría a su procesador', async () => {
    const route = createJobRouter(unusedDeps);
    await expect(route({ name: JOBS.auditChainCheck.name, data: {} })).rejects.toThrow('no se usa');
  });
});

describe('enrutador de trabajos', () => {
  it('envía el análisis de un archivo a su procesador', async () => {
    const route = createJobRouter(unusedDeps);
    await expect(route({ name: JOBS.fileScan.name, data: {} })).rejects.toThrow(
      'Los datos del trabajo no son válidos',
    );
  });
});

describe('enrutador de trabajos de documentos y avisos', () => {
  it('envía la conversión de una versión a PDF a su procesador', async () => {
    const route = createJobRouter(unusedDeps);
    await expect(route({ name: JOBS.versionRender.name, data: {} })).rejects.toThrow(
      'Los datos del trabajo no son válidos',
    );
  });
});

describe('enrutador de trabajos de documentos y avisos', () => {
  it('envía el escalamiento de tareas vencidas a su procesador', async () => {
    const route = createJobRouter(unusedDeps);
    await expect(route({ name: JOBS.wfOverdueCheck.name, data: {} })).rejects.toThrow('no se usa');
  });
});

describe('enrutador de trabajos de documentos y avisos', () => {
  it('envía la generación de los PDF de los formatos a su procesador', async () => {
    const route = createJobRouter(unusedDeps);
    await expect(route({ name: JOBS.docPdfRender.name, data: {} })).rejects.toThrow('no se usa');
  });
});

describe('enrutador de trabajos de documentos y avisos', () => {
  it('envía la disposición, el texto y los trabajos del CRM a sus procesadores', async () => {
    const route = createJobRouter(unusedDeps);
    for (const job of [
      JOBS.docDispositionPropose,
      JOBS.docDispositionExecute,
      JOBS.docTextExtract,
      JOBS.crmActivityRemind,
      JOBS.crmQuoteWork,
      JOBS.crmQuoteExpire,
    ]) {
      await expect(route({ name: job.name, data: {} })).rejects.toThrow('no se usa');
    }
  });
});

describe('enrutador de trabajos de documentos y avisos', () => {
  it('envía los trabajos de cotizaciones, contratos y firma a sus procesadores', async () => {
    const route = createJobRouter(unusedDeps);
    for (const job of [
      JOBS.crmQuoteWork,
      JOBS.crmQuoteExpire,
      JOBS.ctrPdfRender,
      JOBS.ctrFollowUp,
      JOBS.sigWork,
      JOBS.sigFollowUp,
      JOBS.prjAcceptanceWork,
      JOBS.astLoanWork,
      JOBS.hrRetention,
      JOBS.hrDailyWork,
      JOBS.sstDailyWork,
      JOBS.qmsDailyWork,
      JOBS.qmsIndicatorWork,
      JOBS.qmsPdfWork,
      JOBS.innDailyWork,
      JOBS.aiIndexWork,
      JOBS.tenantExportWork,
      JOBS.tenantPurgeWork,
      JOBS.svcSlaWork,
      JOBS.svcCareWork,
      JOBS.webSiteWork,
    ]) {
      await expect(route({ name: job.name, data: {} })).rejects.toThrow('no se usa');
    }
  });
});

describe('enrutador de trabajos de documentos y avisos', () => {
  it('rechaza sin reintento un trabajo sin procesador', async () => {
    const route = createJobRouter(unusedDeps);
    const failure = route({ name: 'desconocido.trabajo', data: {} });
    await expect(failure).rejects.toBeInstanceOf(UnrecoverableError);
    await expect(failure).rejects.toThrow(
      'No hay procesador para el trabajo «desconocido.trabajo».',
    );
  });
});

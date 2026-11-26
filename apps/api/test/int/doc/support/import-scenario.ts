import { v7 as uuidv7 } from 'uuid';
import type { z } from 'zod';

import { renderVersionPdf, scanUploadedFile } from '../../../../src/modules/doc/index.js';
import {
  importMasterList,
  type ImportReport,
} from '../../../../src/modules/doc/application/master-list-import.js';
import type { ImportFiles } from '../../../../src/modules/doc/application/import-references.js';
import { toCsv } from '../../../../src/platform/export/csv.js';
import { JOBS, type JobDefinition } from '../../../../src/platform/queues/jobs.js';
import { apiDatabase } from '../../support/integration-database.js';
import type { Person } from '../../iam/support/access-scenario.js';
import { samplePdf, storage } from './file-scenario.js';
import { SgcScenario } from './sgc-scenario.js';
import { wordFile } from './doc-scenario.js';

// Escenario de la carga inicial del Listado Maestro (B19): un listado ficticio, una carpeta de
// archivos en memoria y una cola de prueba; lo que haría el worker (antivirus y PDF) se corre aquí.

interface QueuedJob {
  readonly name: string;
  readonly data: unknown;
}

/** Cola de prueba: guarda los trabajos para correrlos como el worker. */
class RecordingQueue {
  readonly jobs: QueuedJob[] = [];

  add<Job extends JobDefinition>(job: Job, payload: z.input<Job['schema']>): Promise<string> {
    this.jobs.push({ name: job.name, data: job.schema.parse(payload) });
    return Promise.resolve(uuidv7());
  }

  take(): QueuedJob[] {
    return this.jobs.splice(0);
  }
}

/** Una fila del listado de prueba, con las columnas del RE-SGC-001. */
export interface ListingRow {
  readonly code: string;
  readonly title: string;
  readonly version: string;
  readonly date: string;
  readonly status?: string;
  readonly owner?: string;
  readonly targets?: string;
  readonly classification?: string;
}

const HEADER = [
  'Código',
  'Nombre',
  'Versión',
  'Fecha',
  'Estado',
  'Responsable',
  'Destinatarios',
  'Clasificación',
];

export function listingCsv(rows: readonly ListingRow[]): string {
  return toCsv(
    HEADER,
    rows.map((row) => [
      row.code,
      row.title,
      row.version,
      row.date,
      row.status ?? 'Vigente',
      row.owner ?? null,
      row.targets ?? null,
      row.classification ?? 'Interno',
    ]),
  );
}

/** Carpeta en memoria: un PDF por código, o un Word para los que se indiquen. */
export function memoryFiles(codes: readonly string[], words: readonly string[] = []): ImportFiles {
  const files = new Map<string, Buffer>();
  for (const code of codes) {
    if (words.includes(code)) files.set(`${code} Procedimiento.docx`, wordFile().content);
    else files.set(`${code} Documento.pdf`, samplePdf(code));
  }
  return {
    names: () => [...files.keys()],
    read: (name) => Promise.resolve(files.get(name) ?? Buffer.alloc(0)),
  };
}

export class ImportScenario extends SgcScenario {
  readonly queue = new RecordingQueue();

  async runImport(
    person: Person,
    listing: string,
    files: ImportFiles,
    apply = true,
  ): Promise<ImportReport> {
    const deps = {
      database: apiDatabase(),
      storage: storage(),
      queue: this.queue,
      clock: this.clock,
    };
    const request = { tenantId: this.tenant.id, userId: person.id, listing, files, apply };
    return importMasterList(deps, request);
  }

  /** Lo que haría el worker con los trabajos en cola: analizar los archivos y convertir a PDF. */
  async runWorker(): Promise<void> {
    for (const job of this.queue.take()) {
      if (job.name === JOBS.fileScan.name) {
        const data = JOBS.fileScan.schema.parse(job.data);
        const antivirus = () => Promise.resolve({ infected: false } as const);
        const deps = { database: apiDatabase(), clock: this.clock, storage: storage(), antivirus };
        await scanUploadedFile(data, deps);
      } else if (job.name === JOBS.versionRender.name) {
        const data = JOBS.versionRender.schema.parse(job.data);
        const convert = () => Promise.resolve(samplePdf('Convertido'));
        await renderVersionPdf(data, {
          database: apiDatabase(),
          clock: this.clock,
          storage: storage(),
          convert,
        });
      }
    }
  }

  /** Corre la carga y el worker hasta que nada quede esperando. */
  async importUntilDone(
    person: Person,
    listing: string,
    files: ImportFiles,
  ): Promise<ImportReport> {
    let report = await this.runImport(person, listing, files);
    for (let round = 0; report.waiting > 0 && round < 5; round += 1) {
      await this.runWorker();
      report = await this.runImport(person, listing, files);
    }
    return report;
  }

  /** Un cargo activo con un nombre único, para el responsable y los destinatarios. */
  async namedPosition(name: string): Promise<string> {
    const processId = await this.processId('SGC');
    return this.inTenant(async (tx) => {
      const position = await tx.position.create({
        data: { tenantId: this.tenant.id, orgUnitId: processId, name },
      });
      return position.id;
    });
  }
}

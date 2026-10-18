import { readdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { setTimeout as sleep } from 'node:timers/promises';
import { parseArgs } from 'node:util';

import { emailSchema } from '@arza/contracts';
import { z } from 'zod';

import { systemClock } from '../../../../platform/clock/clock.js';
import { DatabaseService } from '../../../../platform/database/database.service.js';
import { JobQueue } from '../../../../platform/queues/job-queue.js';
import { activeRoleCodes, findLoginUser } from '../../../iam/index.js';
import type { ImportFiles } from '../../application/import-references.js';
import {
  importMasterList,
  type ImportDependencies,
  type ImportReport,
} from '../../application/master-list-import.js';
import { fileStorageFrom } from '../../infrastructure/file-storage.js';
import { detailLines, reportCsv, summaryLines } from './import-report.js';

// `pnpm doc:importar-listado`: carga inicial del Listado Maestro RE-SGC-001 (B19, numeral 18.2).
// Sin --aplicar solo revisa y entrega el informe. Con --aplicar carga y espera al worker (antivirus
// y PDF) hasta terminar o hasta 30 minutos; se puede correr otra vez y continúa donde quedó.

const USAGE = [
  'Uso: pnpm doc:importar-listado --correo <correo> --listado <archivo.csv> --archivos <carpeta> [--aplicar]',
  '  --correo: la persona de Calidad que hace la carga (debe tener el rol CALIDAD)',
  '  --listado: el RE-SGC-001 guardado como CSV (columnas en docs/manual/datos/doc.md)',
  '  --archivos: la carpeta con el archivo de cada documento (su nombre empieza por el código)',
  '  --aplicar: carga de verdad; sin esta opción solo revisa',
].join('\n');

const ROUND_MS = 15_000;
const MAX_ROUNDS = 120;

const envSchema = z.object({
  DATABASE_URL: z.url({ protocol: /^postgres(ql)?$/ }),
  VALKEY_URL: z.url({ protocol: /^rediss?$/ }),
  S3_ENDPOINT: z.url(),
  S3_REGION: z.string().min(1),
  S3_BUCKET: z.string().min(1),
  S3_ACCESS_KEY: z.string().min(1),
  S3_SECRET_KEY: z.string().min(1),
});

const argsSchema = z.object({
  correo: emailSchema,
  listado: z.string().min(1),
  archivos: z.string().min(1),
  aplicar: z.boolean().default(false),
});

type Args = z.output<typeof argsSchema>;

function parseInput(): Args {
  const { values } = parseArgs({
    options: {
      correo: { type: 'string' },
      listado: { type: 'string' },
      archivos: { type: 'string' },
      aplicar: { type: 'boolean' },
    },
  });
  const parsed = argsSchema.safeParse(values);
  if (!parsed.success) {
    const fields = parsed.error.issues.map((issue) => issue.path.join('.')).join(', ');
    throw new Error(`Revise: ${fields}.\n${USAGE}`);
  }
  return parsed.data;
}

/** pnpm corre el comando desde apps/api: las rutas se toman desde donde la persona lo escribió. */
function fromUser(path: string): string {
  return resolve(process.env['INIT_CWD'] ?? process.cwd(), path);
}

async function folderFiles(folder: string): Promise<ImportFiles> {
  const names = (await readdir(folder, { withFileTypes: true }))
    .filter((entry) => entry.isFile())
    .map((entry) => entry.name);
  return { names: () => names, read: (name) => readFile(join(folder, name)) };
}

async function importer(database: DatabaseService, email: string) {
  const person = await findLoginUser(database, email);
  if (person === null) throw new Error('No hay una cuenta con ese correo.');
  const roles = await database.withTenant(person, (tx) =>
    activeRoleCodes(tx, person.userId, systemClock.now()),
  );
  if (!roles.includes('CALIDAD')) throw new Error('La persona debe tener el rol CALIDAD.');
  return person;
}

function print(report: ImportReport, applied: boolean): void {
  process.stdout.write(
    `${[...summaryLines(report, applied), ...detailLines(report)].join('\n')}\n`,
  );
}

async function run(args: Args, deps: ImportDependencies, database: DatabaseService) {
  const person = await importer(database, args.correo);
  const listing = await readFile(fromUser(args.listado), 'utf8');
  const request = {
    ...person,
    listing,
    files: await folderFiles(fromUser(args.archivos)),
    apply: args.aplicar,
  };
  let report = await importMasterList(deps, request);
  for (let round = 1; args.aplicar && report.waiting > 0 && round <= MAX_ROUNDS; round += 1) {
    process.stdout.write(
      `Esperando el antivirus y el PDF de ${String(report.waiting)} documentos…\n`,
    );
    await sleep(ROUND_MS);
    report = await importMasterList(deps, request);
  }
  print(report, args.aplicar);
  const stamp = systemClock.now().toISOString().slice(0, 16).replace(/[:T]/gu, '-');
  const target = join(
    dirname(fromUser(args.listado)),
    `informe-carga-listado-maestro-${stamp}.csv`,
  );
  await writeFile(target, reportCsv(report, args.aplicar), 'utf8');
  process.stdout.write(`Informe guardado en ${target}\n`);
  if (report.problems.length > 0 || report.differences.length > 0) process.exitCode = 1;
}

async function main(): Promise<void> {
  const args = parseInput();
  const env = envSchema.parse(process.env);
  const database = new DatabaseService(env.DATABASE_URL);
  const queue = new JobQueue({ url: env.VALKEY_URL });
  try {
    const deps = { database, queue, storage: fileStorageFrom(env), clock: systemClock };
    await run(args, deps, database);
  } finally {
    await Promise.all([queue.close(), database.onModuleDestroy()]);
  }
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  process.stderr.write(`${message}\n`);
  process.exitCode = 1;
});

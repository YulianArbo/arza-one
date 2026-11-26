import { readFile, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { parseArgs } from 'node:util';

import { emailSchema } from '@arza/contracts';
import { z } from 'zod';

import { systemClock } from '../../../../platform/clock/clock.js';
import { DatabaseService } from '../../../../platform/database/database.service.js';
import { JobQueue } from '../../../../platform/queues/job-queue.js';
import {
  AccountNotifier,
  findLoginUser,
  InvitationUseCase,
  PasswordSetter,
} from '../../../iam/index.js';
import { runInitialLoad, type LoadReport } from '../../application/initial-load.js';
import type { LoadFiles } from '../../application/load-context.js';
import { detailLines, reportCsv, summaryLines } from './load-report.js';

// `pnpm puesta:cargar`: carga inicial de la puesta en marcha (B45). Lee de una carpeta las
// plantillas areas.csv, cargos.csv, usuarios.csv y terceros.csv (las que estén). Sin --aplicar
// solo revisa; con --aplicar carga, siempre que la revisión no tenga problemas. Se puede repetir.

const USAGE = [
  'Uso: pnpm puesta:cargar --correo <correo> --carpeta <carpeta> [--aplicar]',
  '  --correo: la persona que hace la carga (necesita los permisos de las pantallas de cada dato)',
  '  --carpeta: la carpeta con areas.csv, cargos.csv, usuarios.csv y terceros.csv',
  '  --aplicar: carga de verdad; sin esta opción solo revisa',
].join('\n');

const FILES: Readonly<Record<keyof LoadFiles, string>> = {
  areas: 'areas.csv',
  positions: 'cargos.csv',
  users: 'usuarios.csv',
  companies: 'terceros.csv',
};

const envSchema = z.object({
  DATABASE_URL: z.url({ protocol: /^postgres(ql)?$/ }),
  VALKEY_URL: z.url({ protocol: /^rediss?$/ }),
});

const argsSchema = z.object({
  correo: emailSchema,
  carpeta: z.string().min(1),
  aplicar: z.boolean().default(false),
});

type Args = z.output<typeof argsSchema>;

function parseInput(): Args {
  const { values } = parseArgs({
    options: {
      correo: { type: 'string' },
      carpeta: { type: 'string' },
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

/** pnpm corre el comando desde apps/api: la carpeta se toma desde donde la persona lo escribió. */
function fromUser(path: string): string {
  return resolve(process.env['INIT_CWD'] ?? process.cwd(), path);
}

async function optionalFile(path: string): Promise<string | undefined> {
  return readFile(path, 'utf8').catch((error: unknown) => {
    if (error instanceof Error && 'code' in error && error.code === 'ENOENT') return undefined;
    throw error;
  });
}

async function loadFiles(folder: string): Promise<LoadFiles> {
  const read = (key: keyof LoadFiles) => optionalFile(join(folder, FILES[key]));
  const files: LoadFiles = {
    areas: await read('areas'),
    positions: await read('positions'),
    users: await read('users'),
    companies: await read('companies'),
  };
  if (Object.values(files).every((content) => content === undefined)) {
    throw new Error(`La carpeta no tiene ninguna plantilla (${Object.values(FILES).join(', ')}).`);
  }
  return files;
}

async function save(folder: string, report: LoadReport): Promise<string> {
  const stamp = systemClock.now().toISOString().slice(0, 16).replace(/[:T]/gu, '-');
  const target = join(folder, `informe-carga-inicial-${stamp}.csv`);
  await writeFile(target, reportCsv(report), 'utf8');
  return target;
}

async function main(): Promise<void> {
  const args = parseInput();
  const env = envSchema.parse(process.env);
  const database = new DatabaseService(env.DATABASE_URL);
  const queue = new JobQueue({ url: env.VALKEY_URL });
  try {
    const person = await findLoginUser(database, args.correo);
    if (person === null) throw new Error('No hay una cuenta con ese correo.');
    const folder = fromUser(args.carpeta);
    const invitations = new InvitationUseCase(
      database,
      systemClock,
      new AccountNotifier(queue),
      new PasswordSetter(),
    );
    const report = await runInitialLoad(
      { database, clock: systemClock, invitations },
      { ...person, files: await loadFiles(folder), apply: args.aplicar },
    );
    process.stdout.write(`${[...summaryLines(report), ...detailLines(report)].join('\n')}\n`);
    process.stdout.write(`Informe guardado en ${await save(folder, report)}\n`);
    const problems = report.sheets.some((sheet) => sheet.problems.length > 0);
    if (report.missingPermissions.length > 0 || problems) process.exitCode = 1;
  } finally {
    await Promise.all([queue.close(), database.onModuleDestroy()]);
  }
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  process.stderr.write(`${message}\n`);
  process.exitCode = 1;
});

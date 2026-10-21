import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { parseArgs } from 'node:util';

import { emailSchema } from '@arza/contracts';
import { z } from 'zod';

import { systemClock } from '../../../../platform/clock/clock.js';
import { DatabaseService } from '../../../../platform/database/database.service.js';
import { activeRoleCodes, findLoginUser } from '../../../iam/index.js';
import {
  importRetentionTable,
  type RetentionImportReport,
} from '../../application/retention-import.js';

// `pnpm doc:importar-retencion`: carga la Tabla de Retención RE-SGC-005 (B21, numeral 18.2, paso
// 4) desde su CSV. Sin --aplicar solo revisa y explica cada fila con problemas.

const USAGE = [
  'Uso: pnpm doc:importar-retencion --correo <correo> --tabla <archivo.csv> [--aplicar]',
  '  --correo: la persona de Calidad que hace la carga (debe tener el rol CALIDAD)',
  '  --tabla: el RE-SGC-005 guardado como CSV (columnas en docs/manual/datos/doc.md)',
  '  --aplicar: carga de verdad; sin esta opción solo revisa',
].join('\n');

const envSchema = z.object({ DATABASE_URL: z.url({ protocol: /^postgres(ql)?$/ }) });

const argsSchema = z.object({
  correo: emailSchema,
  tabla: z.string().min(1),
  aplicar: z.boolean().default(false),
});

type Args = z.output<typeof argsSchema>;

function parseInput(): Args {
  const { values } = parseArgs({
    options: {
      correo: { type: 'string' },
      tabla: { type: 'string' },
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

async function importer(database: DatabaseService, email: string) {
  const person = await findLoginUser(database, email);
  if (person === null) throw new Error('No hay una cuenta con ese correo.');
  const roles = await database.withTenant(person, (tx) =>
    activeRoleCodes(tx, person.userId, systemClock.now()),
  );
  if (!roles.includes('CALIDAD')) throw new Error('La persona debe tener el rol CALIDAD.');
  return person;
}

function lines(report: RetentionImportReport, applied: boolean): string[] {
  const outcome = applied
    ? `Reglas creadas: ${String(report.created.length)}.`
    : 'Solo se revisó: no se creó nada. Para cargar, repita con --aplicar.';
  return [
    `Filas leídas: ${String(report.read)}.`,
    `Reglas que ya existían (no se tocan): ${String(report.existing.length)}.`,
    `Filas con problemas: ${String(report.problems.length)}.`,
    ...report.problems.map(
      (p) => `  Fila ${String(p.row)} (${p.code ?? 'sin código'}): ${p.problem}`,
    ),
    report.problems.length > 0 && applied
      ? 'Con problemas no se carga nada: corríjalos y repita.'
      : outcome,
  ];
}

async function main(): Promise<void> {
  const args = parseInput();
  const env = envSchema.parse(process.env);
  const database = new DatabaseService(env.DATABASE_URL);
  try {
    const person = await importer(database, args.correo);
    const csv = await readFile(
      resolve(process.env['INIT_CWD'] ?? process.cwd(), args.tabla),
      'utf8',
    );
    const report = await importRetentionTable(
      { database, clock: systemClock },
      { ...person, csv, apply: args.aplicar },
    );
    process.stdout.write(`${lines(report, args.aplicar).join('\n')}\n`);
    if (report.problems.length > 0) process.exitCode = 1;
  } finally {
    await database.onModuleDestroy();
  }
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  process.stderr.write(`${message}\n`);
  process.exitCode = 1;
});

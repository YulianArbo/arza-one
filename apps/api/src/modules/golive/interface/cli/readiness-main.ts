import { writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { parseArgs } from 'node:util';

import { z } from 'zod';

import { systemClock } from '../../../../platform/clock/clock.js';
import { DatabaseService } from '../../../../platform/database/database.service.js';
import { DEMO_TENANTS, PLATFORM_TENANT } from '../../../../platform/database/seed/seed-data.js';
import { toCsv } from '../../../../platform/export/csv.js';
import { reviewReadiness, type ReadinessCheck } from '../../application/readiness.js';

// `pnpm puesta:revisar`: revisión de puesta en marcha (B45, decisión 10). Solo lee la base de datos
// y responde «cumple» o «no cumple» en los puntos del anexo E que la plataforma comprueba sola.
// Guarda el informe en CSV en la carpeta desde donde se corre, como evidencia de la lista.

const USAGE = [
  'Uso: pnpm puesta:revisar [--empresa <empresa>]',
  '  --empresa: plataforma (por defecto, ARZA TECH) o el identificador de la empresa',
].join('\n');

const envSchema = z.object({ DATABASE_URL: z.url({ protocol: /^postgres(ql)?$/ }) });

const argsSchema = z.object({
  empresa: z
    .string()
    .default('plataforma')
    .transform((value) => (value === 'plataforma' ? PLATFORM_TENANT.id : value))
    .pipe(z.uuid({ message: 'empresa desconocida' })),
});

function parseInput(): z.output<typeof argsSchema> {
  const { values } = parseArgs({ options: { empresa: { type: 'string' } } });
  const parsed = argsSchema.safeParse(values);
  if (!parsed.success) throw new Error(`Revise: empresa.\n${USAGE}`);
  return parsed.data;
}

function line(check: ReadinessCheck): string {
  const mark = check.ok ? 'CUMPLE   ' : 'NO CUMPLE';
  return `${mark} [punto ${String(check.item)}] ${check.title}: ${check.detail}`;
}

async function save(checks: readonly ReadinessCheck[]): Promise<string> {
  const stamp = systemClock.now().toISOString().slice(0, 16).replace(/[:T]/gu, '-');
  const folder = resolve(process.env['INIT_CWD'] ?? process.cwd());
  const target = join(folder, `revision-puesta-en-marcha-${stamp}.csv`);
  const rows = checks.map((check) => [
    String(check.item),
    check.title,
    check.ok ? 'Cumple' : 'No cumple',
    check.detail,
  ]);
  await writeFile(
    target,
    toCsv(['Punto del anexo E', 'Verificación', 'Resultado', 'Detalle'], rows),
    'utf8',
  );
  return target;
}

async function main(): Promise<void> {
  const { empresa } = parseInput();
  const env = envSchema.parse(process.env);
  const database = new DatabaseService(env.DATABASE_URL);
  try {
    const checks = await reviewReadiness(database, {
      tenantId: empresa,
      demoTenantIds: DEMO_TENANTS.map((tenant) => tenant.id),
    });
    process.stdout.write(`${checks.map(line).join('\n')}\n`);
    process.stdout.write(`Informe guardado en ${await save(checks)}\n`);
    if (checks.some((check) => !check.ok)) process.exitCode = 1;
  } finally {
    await database.onModuleDestroy();
  }
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  process.stderr.write(`${message}\n`);
  process.exitCode = 1;
});

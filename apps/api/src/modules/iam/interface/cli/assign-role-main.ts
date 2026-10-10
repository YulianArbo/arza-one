import { parseArgs } from 'node:util';

import { emailSchema } from '@arza/contracts';
import { z } from 'zod';

import { systemClock } from '../../../../platform/clock/clock.js';
import { DatabaseService } from '../../../../platform/database/database.service.js';
import { JobQueue } from '../../../../platform/queues/job-queue.js';
import { AccountNotifier } from '../../application/account-notifier.js';
import { CliRoleAssignment } from '../../application/cli-role-assignment.js';

// `pnpm iam:asignar-rol`: el responsable técnico asigna un rol (B10). Sirve sobre todo para dar el
// primer rol de administrador de una empresa: desde la pantalla nadie se asigna roles a sí mismo,
// así que el primero lo asigna el sistema. Queda en la auditoría como acción del sistema.

const USAGE = [
  'Uso: pnpm iam:asignar-rol --correo <correo> --rol <CODIGO> [--vence dd/mm/aaaa]',
  '  --rol: por ejemplo ADMIN_PLATAFORMA, DIRECCION o AUDITOR',
  '  --vence: último día del rol, en hora de Colombia (obligatorio para AUDITOR, 90 días como máximo)',
].join('\n');

const envSchema = z.object({
  DATABASE_URL: z.url({ protocol: /^postgres(ql)?$/ }),
  VALKEY_URL: z.url({ protocol: /^rediss?$/ }),
});

/** dd/mm/aaaa: el rol vale hasta el final de ese día en Colombia (UTC-5). */
const bogotaEndOfDay = z
  .string()
  .regex(/^\d{2}\/\d{2}\/\d{4}$/)
  .transform((value) => {
    const [day, month, year] = value.split('/');
    return new Date(`${year ?? ''}-${month ?? ''}-${day ?? ''}T23:59:59-05:00`);
  })
  .refine((date) => !Number.isNaN(date.getTime()), { message: 'fecha inválida' });

const argsSchema = z.object({
  correo: emailSchema,
  rol: z
    .string()
    .trim()
    .toUpperCase()
    .regex(/^[A-Z][A-Z0-9_]+$/),
  vence: bogotaEndOfDay.optional(),
});

function parseInput(): z.output<typeof argsSchema> {
  const { values } = parseArgs({
    options: { correo: { type: 'string' }, rol: { type: 'string' }, vence: { type: 'string' } },
  });
  const parsed = argsSchema.safeParse(values);
  if (!parsed.success) {
    const fields = parsed.error.issues.map((issue) => issue.path.join('.')).join(', ');
    throw new Error(`Revise: ${fields}.\n${USAGE}`);
  }
  return parsed.data;
}

async function main(): Promise<void> {
  const input = parseInput();
  const env = envSchema.parse(process.env);
  const database = new DatabaseService(env.DATABASE_URL);
  const queue = new JobQueue({ url: env.VALKEY_URL });
  try {
    const assignment = new CliRoleAssignment(database, systemClock, new AccountNotifier(queue));
    const outcome = await assignment.execute({
      email: input.correo,
      roleCode: input.rol,
      validUntil: input.vence ?? null,
    });
    process.stdout.write(
      outcome === 'assigned'
        ? 'Rol asignado. La persona recibirá un aviso por correo.\n'
        : 'No hay una cuenta con ese correo o la empresa no tiene ese rol.\n',
    );
    if (outcome !== 'assigned') process.exitCode = 1;
  } finally {
    await Promise.all([queue.close(), database.onModuleDestroy()]);
  }
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  process.stderr.write(`${message}\n`);
  process.exitCode = 1;
});

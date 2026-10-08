import { parseArgs } from 'node:util';

import { emailSchema } from '@arza/contracts';
import { z } from 'zod';

import { systemClock } from '../../../../platform/clock/clock.js';
import { DatabaseService } from '../../../../platform/database/database.service.js';
import { DEMO_TENANTS, PLATFORM_TENANT } from '../../../../platform/database/seed/seed-data.js';
import { JobQueue } from '../../../../platform/queues/job-queue.js';
import { AccountNotifier } from '../../application/account-notifier.js';
import { InvitationUseCase } from '../../application/invitation.js';
import { PasswordSetter } from '../../application/password-setter.js';

// `pnpm iam:invitar`: el responsable técnico invita a una persona (B08). La pantalla de usuarios
// con su permiso llega en B10. El correo lo envía el worker; en local se ve en Mailpit.

const USAGE = [
  'Uso: pnpm iam:invitar --empresa <empresa> --correo <correo> [--tipo interno|portal] [--nombre "Nombre"]',
  '  --empresa: plataforma, demo-uno, demo-dos o el identificador de la empresa',
].join('\n');

const COMPANY_ALIASES: Readonly<Record<string, string | undefined>> = {
  plataforma: PLATFORM_TENANT.id,
  'demo-uno': DEMO_TENANTS[0]?.id,
  'demo-dos': DEMO_TENANTS[1]?.id,
};

const KINDS = { interno: 'internal', portal: 'portal' } as const;

const envSchema = z.object({
  DATABASE_URL: z.url({ protocol: /^postgres(ql)?$/ }),
  VALKEY_URL: z.url({ protocol: /^rediss?$/ }),
});

const argsSchema = z.object({
  empresa: z.string().transform((value, context) => {
    const id = COMPANY_ALIASES[value] ?? value;
    if (!z.uuid().safeParse(id).success) {
      context.addIssue({ code: 'custom', message: 'empresa desconocida' });
      return z.NEVER;
    }
    return id;
  }),
  correo: emailSchema,
  tipo: z.enum(['interno', 'portal']).default('interno'),
  nombre: z.string().trim().min(2).max(120).optional(),
});

function parseInput(): z.output<typeof argsSchema> {
  const { values } = parseArgs({
    options: {
      empresa: { type: 'string' },
      correo: { type: 'string' },
      tipo: { type: 'string' },
      nombre: { type: 'string' },
    },
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
    const invitation = new InvitationUseCase(
      database,
      systemClock,
      new AccountNotifier(queue),
      new PasswordSetter(),
    );
    const outcome = await invitation.invite({
      tenantId: input.empresa,
      email: input.correo,
      kind: KINDS[input.tipo],
      displayName: input.nombre ?? null,
    });
    const verb = outcome === 'invited' ? 'Invitación creada' : 'Invitación reenviada';
    process.stdout.write(
      `${verb}. El worker enviará el correo con el enlace (vence en 72 horas).\n`,
    );
  } finally {
    await Promise.all([queue.close(), database.onModuleDestroy()]);
  }
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  process.stderr.write(`${message}\n`);
  process.exitCode = 1;
});

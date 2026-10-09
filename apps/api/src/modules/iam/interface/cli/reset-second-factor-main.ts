import { parseArgs } from 'node:util';

import { emailSchema } from '@arza/contracts';
import { z } from 'zod';

import { systemClock } from '../../../../platform/clock/clock.js';
import { DatabaseService } from '../../../../platform/database/database.service.js';
import { JobQueue } from '../../../../platform/queues/job-queue.js';
import { AccountNotifier } from '../../application/account-notifier.js';
import { SecondFactorResetUseCase } from '../../application/second-factor-reset.js';

// `pnpm iam:reiniciar-segundo-factor`: el responsable técnico reinicia el segundo factor de una
// persona que perdió el celular y los códigos de recuperación (B09). Antes de hacerlo, confirme la
// identidad de la persona por otro medio (en persona o por videollamada). La pantalla de usuarios
// con el permiso iam.user.reset_mfa llega en B10.

const USAGE = 'Uso: pnpm iam:reiniciar-segundo-factor --correo <correo>';

const envSchema = z.object({
  DATABASE_URL: z.url({ protocol: /^postgres(ql)?$/ }),
  VALKEY_URL: z.url({ protocol: /^rediss?$/ }),
});

function parseEmail(): string {
  const { values } = parseArgs({ options: { correo: { type: 'string' } } });
  const parsed = emailSchema.safeParse(values.correo);
  if (!parsed.success) throw new Error(`Revise el correo.\n${USAGE}`);
  return parsed.data;
}

async function main(): Promise<void> {
  const email = parseEmail();
  const env = envSchema.parse(process.env);
  const database = new DatabaseService(env.DATABASE_URL);
  const queue = new JobQueue({ url: env.VALKEY_URL });
  try {
    const reset = new SecondFactorResetUseCase(database, systemClock, new AccountNotifier(queue));
    const result = await reset.execute(email);
    if (result === null) throw new Error('No hay ninguna cuenta con ese correo.');
    process.stdout.write(
      `Segundo factor reiniciado. Se cerraron ${String(result.sessionsClosed)} sesiones y el worker enviará el aviso por correo. La persona lo configurará de nuevo al entrar.\n`,
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

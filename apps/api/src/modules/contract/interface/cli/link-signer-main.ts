import { parseArgs } from 'node:util';

import { emailSchema } from '@arza/contracts';
import { z } from 'zod';

import { systemClock } from '../../../../platform/clock/clock.js';
import { DatabaseService } from '../../../../platform/database/database.service.js';
import { linkCompanySigner, type SignerLinkOutcome } from '../../application/signer-link.js';

// `pnpm contratos:vincular-firmante`: el responsable técnico vincula la cuenta de quien firma por la
// empresa (Dirección) con su persona en Terceros, que tiene su documento (B25, decisión 3).

const USAGE = [
  'Uso: pnpm contratos:vincular-firmante --correo <correo> --documento <número>',
  '  --correo: el de la cuenta de la persona de la Dirección',
  '  --documento: el número de su cédula, como está en su ficha de Terceros (sin puntos)',
].join('\n');

const envSchema = z.object({ DATABASE_URL: z.url({ protocol: /^postgres(ql)?$/ }) });

const argsSchema = z.object({
  correo: emailSchema,
  documento: z
    .string()
    .trim()
    .regex(/^[0-9A-Za-z]{3,20}$/),
});

const MESSAGES: Readonly<Record<SignerLinkOutcome, string>> = {
  linked: 'Listo: la persona ya puede firmar por la empresa.\n',
  no_account: 'No hay una cuenta con ese correo.\n',
  no_person: 'No hay una persona en Terceros con ese documento en la empresa de esa cuenta.\n',
  not_internal: 'La cuenta no es de un colaborador activo.\n',
};

function parseInput(): z.output<typeof argsSchema> {
  const { values } = parseArgs({
    options: { correo: { type: 'string' }, documento: { type: 'string' } },
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
  try {
    const outcome = await linkCompanySigner(database, systemClock, {
      email: input.correo,
      idNumber: input.documento,
    });
    process.stdout.write(MESSAGES[outcome]);
    if (outcome !== 'linked') process.exitCode = 1;
  } finally {
    await database.onModuleDestroy();
  }
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  process.stderr.write(`${message}\n`);
  process.exitCode = 1;
});

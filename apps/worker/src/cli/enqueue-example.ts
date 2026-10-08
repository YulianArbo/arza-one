// Uso: pnpm job:ejemplo [empresa]   (bloque B06)
// Encola el trabajo de ejemplo: el worker envía un correo de prueba que se ve en Mailpit.
// «empresa» es «plataforma» (por defecto), «demo-uno», «demo-dos» o el identificador de una empresa.
import { DEMO_TENANTS, JOBS, JobQueue, PLATFORM_TENANT } from '@arza/api/platform';
import { v7 as uuidv7 } from 'uuid';
import { z } from 'zod';

const TEST_RECIPIENT = 'pruebas@arza-one.test';
const TENANT_ALIASES: Readonly<Record<string, string>> = {
  plataforma: PLATFORM_TENANT.id,
  'demo-uno': DEMO_TENANTS[0]?.id ?? '',
  'demo-dos': DEMO_TENANTS[1]?.id ?? '',
};

const valkeyUrl = z.url({ protocol: /^rediss?$/ }).safeParse(process.env['VALKEY_URL']);
const tenantArgument = process.argv[2] ?? 'plataforma';
const tenantId = TENANT_ALIASES[tenantArgument] ?? tenantArgument;

async function enqueue(url: string): Promise<void> {
  const queue = new JobQueue({ url });
  try {
    const id = await queue.add(JOBS.exampleEmail, {
      tenantId,
      userId: null,
      correlationId: uuidv7(),
      recipient: TEST_RECIPIENT,
    });
    process.stdout.write(
      [
        `Trabajo ${id} encolado para la empresa ${tenantArgument}.`,
        'Si el worker está encendido («pnpm dev»), el correo llega en unos segundos a',
        'http://localhost:8025 (puerto MAILPIT_UI_PORT de .env).',
        '',
      ].join('\n'),
    );
  } finally {
    await queue.close();
  }
}

if (valkeyUrl.success) {
  await enqueue(valkeyUrl.data).catch((error: unknown) => {
    process.stderr.write(`No se pudo encolar el trabajo: ${String(error)}\n`);
    process.exitCode = 1;
  });
} else {
  process.stderr.write('Falta VALKEY_URL en .env. Ejecute «pnpm env:local» y «pnpm infra:up».\n');
  process.exitCode = 1;
}

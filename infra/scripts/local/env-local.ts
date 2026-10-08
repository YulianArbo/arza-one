// Uso: pnpm env:local — crea el archivo .env del entorno local con secretos al azar (B06).
// Nunca sobrescribe un .env que ya exista. Si un puerto está ocupado, escoge otro libre.
import { randomBytes } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:net';

import { generateEnv } from './env-file.ts';
import { ENV_EXAMPLE_PATH, ENV_PATH } from './paths.ts';
import { applyPortChanges, choosePorts, LOCAL_PORTS, PORT_SEARCH_RANGE } from './ports.ts';

/** Intenta ocupar el puerto un instante, como lo haría Docker al publicarlo. */
async function isPortFree(port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const server = createServer();
    server.once('error', () => {
      resolve(false);
    });
    server.listen(port, '127.0.0.1', () => {
      server.close(() => {
        resolve(true);
      });
    });
  });
}

async function freePorts(): Promise<Set<number>> {
  const ports = LOCAL_PORTS.flatMap(({ defaultPort }) =>
    Array.from({ length: PORT_SEARCH_RANGE + 1 }, (_, index) => defaultPort + index),
  );
  const free = await Promise.all(ports.map(async (port) => ((await isPortFree(port)) ? port : 0)));
  return new Set(free.filter((port) => port > 0));
}

async function createEnvFile(): Promise<void> {
  const free = await freePorts();
  const changes = choosePorts((port) => free.has(port));
  const env = generateEnv(readFileSync(ENV_EXAMPLE_PATH, 'utf8'), randomBytes);
  writeFileSync(ENV_PATH, applyPortChanges(env, changes), { flag: 'wx' });
  process.stdout.write('Listo: se creó .env con contraseñas locales al azar.\n');
  for (const { variable, from, to } of changes) {
    process.stdout.write(
      `El puerto ${String(from)} está ocupado en este equipo: ${variable} usará ${String(to)}.\n`,
    );
  }
}

if (existsSync(ENV_PATH)) {
  process.stderr.write(
    [
      'Ya existe un archivo .env; no se modificó.',
      'Si quiere uno nuevo, cámbiele el nombre (por ejemplo, .env.anterior) y repita el comando.',
      '',
    ].join('\n'),
  );
  process.exitCode = 1;
} else {
  await createEnvFile();
}

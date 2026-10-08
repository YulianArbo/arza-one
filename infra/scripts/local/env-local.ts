// Uso: pnpm env:local — crea el archivo .env del entorno local con secretos al azar (B06).
// Nunca sobrescribe un .env que ya exista.
import { randomBytes } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';

import { generateEnv } from './env-file.ts';
import { ENV_EXAMPLE_PATH, ENV_PATH } from './paths.ts';

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
  writeFileSync(ENV_PATH, generateEnv(readFileSync(ENV_EXAMPLE_PATH, 'utf8'), randomBytes), {
    flag: 'wx',
  });
  process.stdout.write('Listo: se creó .env con contraseñas locales al azar.\n');
}

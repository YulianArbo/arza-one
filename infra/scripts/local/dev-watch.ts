// Uso (desde apps/api o apps/worker): node ../../infra/scripts/local/dev-watch.ts <entrada>
// Compila, arranca el programa y, al guardar un cambio, recompila y lo reinicia solo (B06,
// pendiente de B02). Usa el compilador de TypeScript y el modo de vigilancia de Node.
import { spawn, spawnSync, type ChildProcess } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join } from 'node:path';
import { parseEnv } from 'node:util';

const entry = process.argv[2];
const appDir = process.cwd();
const tsc = createRequire(join(appDir, 'package.json')).resolve('typescript/bin/tsc');
const compile = [tsc, '-p', 'tsconfig.build.json'];
const envFile = join(appDir, '../../.env');

/**
 * Variables del archivo .env de la raíz; las que ya traiga el proceso tienen prioridad, como con
 * --env-file. Se leen aquí y no con --env-file porque, en modo de vigilancia, Node también vigila
 * ese archivo y en Windows termina vigilando toda la carpeta del proyecto (node_modules incluida):
 * el programa se reiniciaba con cualquier instalación o compilación.
 */
function childEnv(): NodeJS.ProcessEnv {
  const fromFile = existsSync(envFile) ? parseEnv(readFileSync(envFile, 'utf8')) : {};
  return { ...fromFile, ...process.env };
}

if (entry === undefined) {
  process.stderr.write('Falta el programa a vigilar, por ejemplo dist/main.js.\n');
  process.exit(1);
}

// Primera compilación completa: si falla, se muestran los errores y no se arranca nada.
if (spawnSync(process.execPath, compile, { stdio: 'inherit' }).status !== 0) process.exit(1);

const children: ChildProcess[] = [
  spawn(process.execPath, [...compile, '--watch', '--preserveWatchOutput'], { stdio: 'inherit' }),
  spawn(process.execPath, ['--watch-path=dist', '--watch-preserve-output', entry], {
    stdio: 'inherit',
    env: childEnv(),
  }),
];

function stopAll(): void {
  for (const child of children) child.kill();
}

process.on('SIGINT', stopAll);
process.on('SIGTERM', stopAll);
for (const child of children) {
  child.on('exit', (code) => {
    // Si una parte termina por su cuenta (por ejemplo, el programa no arranca), se apaga la otra.
    if (code !== null && code !== 0) process.exitCode = code;
    stopAll();
  });
}

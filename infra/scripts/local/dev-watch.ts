// Uso (desde apps/api o apps/worker): node ../../infra/scripts/local/dev-watch.ts <entrada>
// Compila, arranca el programa y, al guardar un cambio, recompila y lo reinicia solo (B06,
// pendiente de B02). Usa el compilador de TypeScript y el modo de vigilancia de Node.
import { spawn, spawnSync, type ChildProcess } from 'node:child_process';
import { createRequire } from 'node:module';
import { join } from 'node:path';

const entry = process.argv[2];
const appDir = process.cwd();
const tsc = createRequire(join(appDir, 'package.json')).resolve('typescript/bin/tsc');
const compile = [tsc, '-p', 'tsconfig.build.json'];

if (entry === undefined) {
  process.stderr.write('Falta el programa a vigilar, por ejemplo dist/main.js.\n');
  process.exit(1);
}

// Primera compilación completa: si falla, se muestran los errores y no se arranca nada.
if (spawnSync(process.execPath, compile, { stdio: 'inherit' }).status !== 0) process.exit(1);

const children: ChildProcess[] = [
  spawn(process.execPath, [...compile, '--watch', '--preserveWatchOutput'], { stdio: 'inherit' }),
  spawn(
    process.execPath,
    ['--watch-path=dist', '--watch-preserve-output', '--env-file-if-exists=../../.env', entry],
    { stdio: 'inherit' },
  ),
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

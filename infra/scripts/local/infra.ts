// Uso: pnpm infra:up | infra:down | infra:reset | infra:status   (bloque B06)
import {
  garageCli,
  main,
  pnpmCommand,
  readEnvFile,
  runCommand,
  STACK_FILES,
} from './node-runner.ts';
import { infraDown, infraReset, infraStatus, infraUp } from './stack-commands.ts';

const print = (message: string): void => {
  process.stdout.write(message);
};

main(() => {
  const action = process.argv[2];
  if (action === 'status') {
    infraStatus({ run: runCommand, files: STACK_FILES });
    return;
  }
  if (action === 'down') {
    infraDown({ run: runCommand, files: STACK_FILES, print });
    return;
  }
  const deps = {
    run: runCommand,
    garage: garageCli,
    files: STACK_FILES,
    pnpm: pnpmCommand(),
    node: process.execPath,
    env: readEnvFile(),
    print,
  };
  if (action === 'reset') infraReset(deps);
  else infraUp(deps);
});

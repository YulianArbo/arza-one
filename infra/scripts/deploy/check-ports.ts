// Uso (GitHub Actions, B07): node infra/scripts/deploy/check-ports.ts <servidor> [puerto SSH]
// Falla si el servidor acepta conexiones en un puerto distinto de 80, 443 y SSH (numeral 10.2).
import { checkPorts, describePorts } from './ports.ts';

const [host, sshPort = '22'] = process.argv.slice(2);
if (host === undefined) {
  process.stderr.write('Uso: node infra/scripts/deploy/check-ports.ts <servidor> [puerto SSH]\n');
  process.exitCode = 2;
} else {
  const report = await checkPorts(host, undefined, Number(sshPort));
  process.stdout.write(describePorts(report));
  if (report.unexpected.length > 0) process.exitCode = 1;
}

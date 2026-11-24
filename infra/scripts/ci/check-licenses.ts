// Uso: node infra/scripts/ci/check-licenses.ts <licencias.json> <AVISOS-DE-TERCEROS.md>
import { runLicenseGate } from './license-gate.ts';

process.exitCode = runLicenseGate(
  process.argv[2] ?? 'licenses.json',
  process.argv[3] ?? 'AVISOS-DE-TERCEROS.md',
);

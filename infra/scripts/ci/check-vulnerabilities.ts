// Uso: node infra/scripts/ci/check-vulnerabilities.ts <informe-osv.json>
import { runVulnerabilityGate } from './vulnerability-gate.ts';

process.exitCode = runVulnerabilityGate(process.argv[2] ?? 'osv-report.json');

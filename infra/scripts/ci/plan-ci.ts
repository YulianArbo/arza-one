// Uso (solo en GitHub Actions): node infra/scripts/ci/plan-ci.ts <commit-anterior>
// Decide qué tareas corren en este cambio (ADR-024) y lo escribe en GITHUB_OUTPUT.
import { fileURLToPath } from 'node:url';

import { runCheckPlan } from './ci-plan.ts';

const REPO_ROOT = fileURLToPath(new URL('../../../', import.meta.url));

async function fetchCheckRuns(sha: string): Promise<unknown> {
  const api = process.env['GITHUB_API_URL'] ?? 'https://api.github.com';
  const url = `${api}/repos/${process.env['GITHUB_REPOSITORY'] ?? ''}/commits/${sha}/check-runs?check_name=Verificaciones`;
  try {
    const response = await fetch(url, {
      headers: {
        accept: 'application/vnd.github+json',
        authorization: `Bearer ${process.env['GITHUB_TOKEN'] ?? ''}`,
      },
    });
    return response.ok ? await response.json() : null;
  } catch {
    return null;
  }
}

process.exitCode = await runCheckPlan(
  {
    event: process.env['GITHUB_EVENT_NAME'] ?? '',
    fullRun: process.env['CI_FULL_RUN'],
    baseSha: process.argv[2] ?? '',
    repoRoot: REPO_ROOT,
    fetchCheckRuns,
  },
  process.env['GITHUB_OUTPUT'] ?? '/dev/stdout',
);

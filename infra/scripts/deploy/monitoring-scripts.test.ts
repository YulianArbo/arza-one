import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

// Umbrales de los guiones de vigilancia del servidor (B44, numeral 10.7). Corren en Linux
// (GitHub): Git Bash en Windows no trae las mismas herramientas de fechas.
const REPO = fileURLToPath(new URL('../../../', import.meta.url));
const HOST = `${REPO}infra/monitoring/host-metrics.sh`;
const DOMAIN = `${REPO}infra/monitoring/domain-expiry.sh`;

function bash(script: string, ...args: string[]): string {
  return execFileSync('bash', [script, ...args], { encoding: 'utf8' }).trim();
}

function samples(lines: readonly string[]): { file: string; done: () => void } {
  const dir = mkdtempSync(join(tmpdir(), 'arza-muestras-'));
  const file = join(dir, 'muestras.log');
  writeFileSync(file, `${lines.join('\n')}\n`);
  return {
    file,
    done: () => {
      rmSync(dir, { recursive: true, force: true });
    },
  };
}

describe.skipIf(process.platform === 'win32')('vigilancia del servidor', () => {
  it('sin nada fuera de lo normal avisa «up» con las cifras', () => {
    const { file, done } = samples(Array.from({ length: 15 }, () => '30 40'));
    expect(bash(HOST, '--evaluate', file, '50')).toBe(
      'up|procesador 30 %, memoria 40 %, disco 50 %',
    );
    done();
  });

  it('procesador al 80 % o más durante 15 minutos seguidos avisa «down»', () => {
    const { file, done } = samples(Array.from({ length: 15 }, () => '85 40'));
    expect(bash(HOST, '--evaluate', file, '50')).toBe('down|procesador sobre 80 % por 15 min');
    done();
  });

  it('un minuto normal dentro de los 15 no alcanza para alertar', () => {
    const lines = Array.from({ length: 15 }, (_, index) => (index === 7 ? '20 40' : '95 90'));
    const { file, done } = samples(lines);
    expect(bash(HOST, '--evaluate', file, '50')).toMatch(/^up\|/);
    done();
  });

  it('el disco al 75 % alerta de inmediato, junto con la memoria', () => {
    const { file, done } = samples(Array.from({ length: 15 }, () => '10 92'));
    expect(bash(HOST, '--evaluate', file, '75')).toBe(
      'down|disco al 75 %; memoria sobre 80 % por 15 min',
    );
    done();
  });
});

describe.skipIf(process.platform === 'win32')('vencimiento del dominio', () => {
  const NOW = '2026-11-24T12:00:00Z';

  it('a más de 20 días, «up»', () => {
    expect(bash(DOMAIN, '--evaluate', '2027-03-01T00:00:00Z', NOW)).toMatch(
      /^up\|el dominio vence/,
    );
  });

  it('a 20 días o menos, «down» con la fecha en dd/mm/aaaa', () => {
    expect(bash(DOMAIN, '--evaluate', '2026-12-10T00:00:00Z', NOW)).toBe(
      'down|el dominio vence en 15 días (10/12/2026): renuévelo',
    );
  });
});

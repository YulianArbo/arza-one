import { spawn, spawnSync } from 'node:child_process';
import { once } from 'node:events';
import { fileURLToPath } from 'node:url';

import { versionResponseSchema } from '@arza/contracts';
import { describe, expect, it } from 'vitest';

import { testEnv } from './support/test-env.js';

// Se prueba el programa compilado real (turbo compila la API antes de sus pruebas).
const MAIN = fileURLToPath(new URL('../dist/main.js', import.meta.url));
const PORT = '4917';

function processEnv(overrides: Record<string, string | undefined>): NodeJS.ProcessEnv {
  return { ...testEnv(overrides), PATH: process.env['PATH'] };
}

async function waitForVersion(attempts: number): Promise<Response> {
  try {
    return await fetch(`http://127.0.0.1:${PORT}/version`);
  } catch (error) {
    if (attempts <= 1) throw error;
    await new Promise((resolve) => setTimeout(resolve, 250));
    return waitForVersion(attempts - 1);
  }
}

describe('arranque de la API', () => {
  it('no arranca si falta una variable de entorno y dice cuál', () => {
    const env = processEnv({ DATABASE_URL: undefined });
    const result = spawnSync(process.execPath, [MAIN], { env, encoding: 'utf8', timeout: 15_000 });
    expect(result.status).toBe(1);
    expect(result.stderr).toContain('La API no puede arrancar');
    expect(result.stderr).toContain('DATABASE_URL: falta; es obligatoria');
  });

  it('arranca con la configuración completa y atiende peticiones', async () => {
    const child = spawn(process.execPath, [MAIN], { env: processEnv({ API_PORT: PORT }) });
    try {
      const response = await waitForVersion(40);
      expect(response.status).toBe(200);
      expect(versionResponseSchema.parse(await response.json()).environment).toBe('local');
    } finally {
      child.kill();
      await once(child, 'exit');
    }
  });
});

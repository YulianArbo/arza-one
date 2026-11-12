import { spawn, spawnSync } from 'node:child_process';
import { once } from 'node:events';
import { fileURLToPath } from 'node:url';

import { errorResponseSchema, healthResponseSchema } from '@arza/contracts';
import { describe, expect, it } from 'vitest';

import { testEnv } from './support/test-env.js';

// Se prueba el programa compilado real (turbo compila la API antes de sus pruebas).
const MAIN = fileURLToPath(new URL('../dist/main.js', import.meta.url));
const PORT = '4917';
// En Windows, con todas las pruebas en paralelo, arrancar puede tardar más de 10 s (B05). Se espera
// hasta poco antes del límite propio de esta prueba (60 s), sin aflojar ninguna comprobación.
const RETRY_DELAY_MS = 250;
const STARTUP_ATTEMPTS = 200;

function processEnv(overrides: Record<string, string | undefined>): NodeJS.ProcessEnv {
  return { ...testEnv(overrides), PATH: process.env['PATH'] };
}

async function waitForHealth(attempts: number): Promise<Response> {
  try {
    return await fetch(`http://127.0.0.1:${PORT}/health`);
  } catch (error) {
    if (attempts <= 1) throw error;
    await new Promise((resolve) => setTimeout(resolve, RETRY_DELAY_MS));
    return waitForHealth(attempts - 1);
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

  // Las direcciones de prueba no llevan a ningún servicio: la API arranca igual y lo informa.
  it('arranca sin las piezas externas, atiende /health y no deja pasar sin límite', async () => {
    const child = spawn(process.execPath, [MAIN], { env: processEnv({ API_PORT: PORT }) });
    try {
      const health = await waitForHealth(STARTUP_ATTEMPTS);
      expect(health.status).toBe(503);
      expect(healthResponseSchema.parse(await health.json()).checks.queues).toBe('down');
      // Sin Valkey no se puede contar el límite de peticiones: se rechaza, no se omite (B06).
      const version = await fetch(`http://127.0.0.1:${PORT}/version`);
      expect(version.status).toBe(500);
      expect(errorResponseSchema.parse(await version.json()).error.code).toBe('INTERNAL_ERROR');
    } finally {
      child.kill();
      await once(child, 'exit');
    }
  }, 60_000);
});

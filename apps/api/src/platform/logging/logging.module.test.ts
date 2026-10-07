import { Writable } from 'node:stream';

import pino from 'pino';
import { describe, expect, it } from 'vitest';

import { testEnv } from '../../../test/support/test-env.js';
import { loadConfig } from '../config/load-config.js';
import { buildPinoHttpOptions } from './logging.module.js';

/** Escribe una línea con las mismas reglas de ocultamiento de la API y la devuelve. */
function logLine(entry: Record<string, unknown>): string {
  const options = buildPinoHttpOptions(loadConfig(testEnv({ LOG_LEVEL: 'info' })));
  let output = '';
  const destination = new Writable({
    write(chunk: Buffer, _encoding, callback): void {
      output += chunk.toString();
      callback();
    },
  });
  pino({ ...options, level: 'info' }, destination).info(entry);
  return output;
}

describe('registros (Pino)', () => {
  it('oculta credenciales, cookies y tokens', () => {
    const line = logLine({
      req: { headers: { authorization: 'Bearer ficticio-1', cookie: 'session=ficticio-2' } },
      user: { password: 'ficticio-3', token: 'ficticio-4', otp_code: '123456' },
    });
    for (const secret of ['ficticio-1', 'ficticio-2', 'ficticio-3', 'ficticio-4', '123456']) {
      expect(line).not.toContain(secret);
    }
    expect(line).toContain('[oculto]');
  });

  it('identifica el servicio y el ambiente en cada línea', () => {
    const line = JSON.parse(logLine({ msg: 'hola' })) as Record<string, unknown>;
    expect(line).toMatchObject({ service: 'api', environment: 'local' });
  });
});

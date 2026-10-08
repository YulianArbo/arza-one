import { Writable } from 'node:stream';

import { describe, expect, it } from 'vitest';

import { createLogger } from './logger.js';

function capture(): { lines: () => Record<string, unknown>[]; stream: Writable } {
  const chunks: string[] = [];
  const stream = new Writable({
    write(chunk: Buffer, _encoding, done) {
      chunks.push(chunk.toString());
      done();
    },
  });
  const lines = (): Record<string, unknown>[] =>
    chunks.map((chunk) => JSON.parse(chunk) as Record<string, unknown>);
  return { lines, stream };
}

describe('registros del worker', () => {
  it('identifican el servicio y el ambiente', () => {
    const { lines, stream } = capture();
    createLogger({ LOG_LEVEL: 'info', APP_ENV: 'local' }, stream).info('hola');
    expect(lines()[0]).toMatchObject({ service: 'worker', environment: 'local', msg: 'hola' });
  });

  it('ocultan contraseñas y tokens, igual que la API', () => {
    const { lines, stream } = capture();
    createLogger({ LOG_LEVEL: 'info', APP_ENV: 'local' }, stream).info(
      { smtp: { password: 'secreta' }, session: { token: 'abc' } },
      'datos',
    );
    const line = JSON.stringify(lines()[0]);
    expect(line).not.toContain('secreta');
    expect(line).not.toContain('abc');
    expect(line).toContain('[oculto]');
  });

  it('respetan el nivel configurado', () => {
    const { lines, stream } = capture();
    createLogger({ LOG_LEVEL: 'warn', APP_ENV: 'local' }, stream).info('no se registra');
    expect(lines()).toEqual([]);
  });

  it('escriben en la salida del proceso si no se indica otro destino', () => {
    expect(createLogger({ LOG_LEVEL: 'fatal', APP_ENV: 'staging' }).level).toBe('fatal');
  });
});

import { describe, expect, it } from 'vitest';

import { closeValkey, connectValkey } from './valkey-connection.js';

// Puerto 1: nadie escucha allí.
const NOBODY = 'redis://127.0.0.1:1';

describe('conexión compartida a Valkey', () => {
  it('no impide arrancar si Valkey no responde e informa el error', async () => {
    const errors: Error[] = [];
    const client = await connectValkey(NOBODY, (error) => errors.push(error));
    expect(client.status).not.toBe('ready');
    expect(errors.length).toBeGreaterThan(0);
    await closeValkey(client);
    // Cerrada, deja de reintentar: no aparecen errores nuevos (ioredis reintenta cada 50 ms o más).
    const errorsAtClose = errors.length;
    await new Promise((resolve) => setTimeout(resolve, 300));
    expect(errors).toHaveLength(errorsAtClose);
  });

  it('sin conexión, un comando falla de inmediato en lugar de quedar en espera', async () => {
    const client = await connectValkey(NOBODY, () => undefined);
    const started = Date.now();
    await expect(client.ping()).rejects.toThrow();
    expect(Date.now() - started).toBeLessThan(500);
    await closeValkey(client);
  });
});

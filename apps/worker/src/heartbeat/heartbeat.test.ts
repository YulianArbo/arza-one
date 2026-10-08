import { afterEach, describe, expect, it, vi } from 'vitest';

import { beat, HEARTBEAT_INTERVAL_MS, heartbeatKey, isAlive, startHeartbeat } from './heartbeat.js';

/** Valkey simulado: guarda cada clave con su vencimiento. */
function fakeValkey(failing = false) {
  const keys = new Map<string, { value: string; ttl: number }>();
  const set = vi.fn(async (key: string, value: string, _mode: 'PX', ttl: number) => {
    if (failing) throw new Error('Valkey caído');
    keys.set(key, { value, ttl });
    return Promise.resolve('OK' as const);
  });
  const exists = vi.fn(async (key: string) => Promise.resolve(keys.has(key) ? 1 : 0));
  return { keys, set, exists };
}

afterEach(() => {
  vi.useRealTimers();
});

describe('latido del worker', () => {
  it('guarda la hora con vencimiento de 45 segundos', async () => {
    const valkey = fakeValkey();
    await beat(valkey, 'equipo-1', new Date('2026-10-07T12:00:00Z'));
    expect(valkey.keys.get(heartbeatKey('equipo-1'))).toEqual({
      value: '2026-10-07T12:00:00.000Z',
      ttl: 45_000,
    });
  });

  it('isAlive dice si hay latido reciente de ese worker', async () => {
    const valkey = fakeValkey();
    expect(await isAlive(valkey, 'equipo-1')).toBe(false);
    await beat(valkey, 'equipo-1', new Date());
    expect(await isAlive(valkey, 'equipo-1')).toBe(true);
    expect(await isAlive(valkey, 'equipo-2')).toBe(false);
  });

  it('late de inmediato, luego cada 15 segundos, hasta que se detiene', () => {
    vi.useFakeTimers();
    const valkey = fakeValkey();
    const stop = startHeartbeat(valkey, 'equipo-1', () => undefined);
    expect(valkey.set).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(HEARTBEAT_INTERVAL_MS * 2);
    expect(valkey.set).toHaveBeenCalledTimes(3);
    stop();
    vi.advanceTimersByTime(HEARTBEAT_INTERVAL_MS * 2);
    expect(valkey.set).toHaveBeenCalledTimes(3);
  });

  it('informa si no pudo latir, sin detener el worker', async () => {
    const errors: unknown[] = [];
    const stop = startHeartbeat(fakeValkey(true), 'equipo-1', (error) => errors.push(error));
    await vi.waitFor(() => {
      expect(errors).toHaveLength(1);
    });
    stop();
  });
});

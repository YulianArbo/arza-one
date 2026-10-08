import { randomBytes } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { parseEnv } from 'node:util';

import { describe, expect, it } from 'vitest';

import { generateEnv } from './env-file.ts';
import { ENV_EXAMPLE_PATH } from './paths.ts';
import { applyPortChanges, choosePorts } from './ports.ts';

const allFree = (): boolean => true;

describe('choosePorts', () => {
  it('no cambia nada si todos los puertos están libres', () => {
    expect(choosePorts(allFree)).toEqual([]);
  });

  it('escoge el siguiente puerto libre para uno ocupado', () => {
    const busy = new Set([5432, 5433]);
    expect(choosePorts((port) => !busy.has(port))).toEqual([
      { variable: 'POSTGRES_PORT', from: 5432, to: 5434 },
    ]);
  });

  it('dos servicios ocupados no reciben el mismo puerto', () => {
    // 3310 ocupado y el siguiente (3311) reservado por Windows; 1025 y 1026 ocupados.
    const busy = new Set([3310, 3311, 1025, 1026]);
    const changes = choosePorts((port) => !busy.has(port));
    const targets = changes.map((change) => change.to);
    expect(targets).toEqual([3312, 1027]);
    expect(new Set(targets).size).toBe(targets.length);
  });

  it('falla con un mensaje claro si no encuentra ninguno libre', () => {
    expect(() => choosePorts((port) => port !== 6379 && (port < 6379 || port > 6400))).toThrow(
      'No hay un puerto libre para VALKEY_PORT cerca de 6379.',
    );
  });
});

describe('applyPortChanges con el .env.example real', () => {
  const env = generateEnv(readFileSync(ENV_EXAMPLE_PATH, 'utf8'), randomBytes);

  it('cambia el puerto y las direcciones que lo usan', () => {
    const changed = parseEnv(
      applyPortChanges(env, [
        { variable: 'POSTGRES_PORT', from: 5432, to: 5433 },
        { variable: 'GARAGE_S3_PORT', from: 3900, to: 3920 },
        { variable: 'SMTP_PORT', from: 1025, to: 1026 },
      ]),
    );
    expect(changed['POSTGRES_PORT']).toBe('5433');
    expect(changed['DATABASE_URL']).toContain('@localhost:5433/arza_one');
    expect(changed['DATABASE_MIGRATION_URL']).toContain('@localhost:5433/arza_one');
    expect(changed['S3_ENDPOINT']).toBe('http://localhost:3920');
    expect(changed['SMTP_PORT']).toBe('1026');
    expect(changed['VALKEY_URL']).toContain('@localhost:6379');
  });

  it('sin cambios deja el archivo igual', () => {
    expect(applyPortChanges(env, [])).toBe(env);
  });
});

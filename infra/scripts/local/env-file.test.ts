import { randomBytes } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { parseEnv } from 'node:util';

import { describe, expect, it } from 'vitest';

import { generateEnv, PLACEHOLDER } from './env-file.ts';
import { ENV_EXAMPLE_PATH } from './paths.ts';

const template = readFileSync(ENV_EXAMPLE_PATH, 'utf8');

function generated(): Record<string, string | undefined> {
  return parseEnv(generateEnv(template, randomBytes));
}

describe('generateEnv con el .env.example real', () => {
  it('no deja ningún valor por reemplazar', () => {
    const env = generated();
    const pending = Object.entries(env).filter(([, value]) => value?.includes(PLACEHOLDER));
    expect(pending).toEqual([]);
  });

  it('cumple los formatos que exige Garage', () => {
    const env = generated();
    expect(env['S3_ACCESS_KEY']).toMatch(/^GK[0-9a-f]{24}$/);
    expect(env['S3_SECRET_KEY']).toMatch(/^[0-9a-f]{64}$/);
    expect(env['GARAGE_RPC_SECRET']).toMatch(/^[0-9a-f]{64}$/);
  });

  it('pone en cada dirección la contraseña de su usuario', () => {
    const env = generated();
    expect(env['DATABASE_URL']).toBe(
      `postgresql://app_user:${env['APP_DB_PASSWORD'] ?? ''}@localhost:5432/arza_one`,
    );
    expect(env['DATABASE_MIGRATION_URL']).toBe(
      `postgresql://migration_user:${env['MIGRATION_DB_PASSWORD'] ?? ''}@localhost:5432/arza_one`,
    );
    expect(env['VALKEY_URL']).toBe(`redis://:${env['VALKEY_PASSWORD'] ?? ''}@localhost:6379`);
  });

  it('genera contraseñas distintas entre sí y en cada ejecución', () => {
    const first = generated();
    const second = generated();
    expect(first['APP_DB_PASSWORD']).not.toBe(first['MIGRATION_DB_PASSWORD']);
    expect(first['SESSION_SECRET']).not.toBe(second['SESSION_SECRET']);
    expect(first['SESSION_SECRET']?.length).toBeGreaterThanOrEqual(43);
  });

  it('conserva comentarios y valores que no son secretos', () => {
    const result = generateEnv(template, randomBytes);
    expect(result).toContain('# Ambiente');
    expect(parseEnv(result)['S3_BUCKET']).toBe('arza-one-local');
  });
});

describe('generateEnv con plantillas mal formadas', () => {
  it('falla si una dirección usa una contraseña que no está en la plantilla', () => {
    expect(() =>
      generateEnv(`DATABASE_URL=postgresql://app_user:${PLACEHOLDER}@db/x`, randomBytes),
    ).toThrow('DATABASE_URL usa la contraseña de APP_DB_PASSWORD');
  });

  it('usa un secreto genérico para variables sin formato propio', () => {
    const env = parseEnv(generateEnv(`NUEVO_SECRETO=${PLACEHOLDER}`, () => Buffer.alloc(32, 1)));
    expect(env['NUEVO_SECRETO']).toBe(Buffer.alloc(32, 1).toString('base64url'));
  });
});

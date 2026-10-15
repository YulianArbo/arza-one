import { ConfigError } from '@arza/api/platform';
import { describe, expect, it } from 'vitest';

import { loadWorkerConfig } from './load-worker-config.js';

// Variables ficticias (CLAUDE.md: nunca datos reales).
const VALID = {
  NODE_ENV: 'test',
  APP_ENV: 'local',
  DATABASE_URL: 'postgresql://app_user:ficticia@127.0.0.1:1/arza_one',
  VALKEY_URL: 'redis://:ficticia@127.0.0.1:1',
  APP_URL: 'http://localhost:3000/app',
  SMTP_HOST: 'localhost',
  SMTP_PORT: '1025',
  MAIL_FROM: 'ARZA ONE <no-responder@arza-one.test>',
  S3_ENDPOINT: 'http://127.0.0.1:1',
  S3_REGION: 'garage',
  S3_BUCKET: 'arza-one-test',
  S3_ACCESS_KEY: 'ficticia',
  S3_SECRET_KEY: 'ficticia',
  CLAMAV_HOST: 'localhost',
};

function problemsOf(raw: Record<string, string | undefined>): readonly string[] {
  try {
    loadWorkerConfig(raw);
  } catch (error) {
    if (error instanceof ConfigError) return error.problems;
    throw error;
  }
  return [];
}

describe('configuración del worker', () => {
  it('acepta una configuración completa y aplica los valores por defecto', () => {
    const config = loadWorkerConfig({ ...VALID, SMTP_USER: '' });
    expect(config.SMTP_PORT).toBe(1025);
    expect(config.WORKER_CONCURRENCY).toBe(5);
    expect(config.LOG_LEVEL).toBe('info');
    expect(config.CLAMAV_PORT).toBe(3310);
    expect(config.SMTP_USER).toBeUndefined();
  });

  it('no arranca si falta una variable y dice cuál, sin mostrar valores', () => {
    expect(problemsOf({ ...VALID, VALKEY_URL: undefined })).toEqual([
      'VALKEY_URL: falta; es obligatoria',
    ]);
    try {
      loadWorkerConfig({ ...VALID, DATABASE_URL: 'mysql://usuario:secreta@x/y' });
    } catch (error) {
      expect(String(error)).toContain('El worker no puede arrancar');
      expect(String(error)).not.toContain('secreta');
    }
  });

  it('rechaza formatos inválidos', () => {
    const problems = problemsOf({ ...VALID, SMTP_PORT: 'veinticinco', WORKER_CONCURRENCY: '0' });
    expect(problems.join('\n')).toMatch(/SMTP_PORT: .+/);
    expect(problems.join('\n')).toMatch(/WORKER_CONCURRENCY: .+/);
  });
});

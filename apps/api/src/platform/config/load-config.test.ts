import { describe, expect, it } from 'vitest';

import { testEnv } from '../../../test/support/test-env.js';
import { ConfigError, loadConfig } from './load-config.js';

function problemsOf(raw: Record<string, string | undefined>): readonly string[] {
  try {
    loadConfig(raw);
  } catch (error) {
    if (error instanceof ConfigError) return error.problems;
    throw error;
  }
  return [];
}

describe('configuración validada al arrancar', () => {
  it('acepta una configuración completa y aplica los valores por defecto', () => {
    const config = loadConfig(testEnv());
    expect(config.API_PORT).toBe(4000);
    expect(config.RATE_LIMIT_MAX_REQUESTS).toBe(100);
    expect(config.GIT_COMMIT).toBe('unknown');
  });

  it('rechaza una variable obligatoria que falta', () => {
    expect(problemsOf(testEnv({ DATABASE_URL: undefined }))).toEqual([
      'DATABASE_URL: falta; es obligatoria',
    ]);
  });

  it('trata una variable vacía como faltante', () => {
    expect(problemsOf(testEnv({ S3_BUCKET: '  ' }))).toEqual(['S3_BUCKET: falta; es obligatoria']);
  });

  it('rechaza una variable con formato inválido', () => {
    const problems = problemsOf(testEnv({ RATE_LIMIT_MAX_REQUESTS: 'cien', APP_ENV: 'dev' }));
    expect(problems).toHaveLength(2);
    expect(problems.join('\n')).toMatch(/RATE_LIMIT_MAX_REQUESTS: .+/);
    expect(problems.join('\n')).toMatch(/APP_ENV: .+/);
  });

  it('rechaza una conexión a base de datos que no es de PostgreSQL', () => {
    expect(problemsOf(testEnv({ DATABASE_URL: 'mysql://user@localhost/db' }))).toHaveLength(1);
  });

  it('nunca incluye el valor de una variable en el mensaje', () => {
    const error = new ConfigError(problemsOf(testEnv({ S3_ENDPOINT: 'valor-secreto-de-prueba' })));
    expect(error.message).toContain('S3_ENDPOINT');
    expect(error.message).not.toContain('valor-secreto-de-prueba');
  });
});

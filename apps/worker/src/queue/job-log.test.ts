import { UnrecoverableError } from 'bullmq';
import { describe, expect, it } from 'vitest';

import { describeJob, jobKey, willRetry, type LoggedJob } from './job-log.js';

function job(overrides: Partial<LoggedJob> = {}): LoggedJob {
  return {
    id: '7',
    name: 'platform.example-email',
    queueName: 'platform',
    attemptsMade: 1,
    opts: { attempts: 6 },
    data: {
      tenantId: 'empresa',
      correlationId: 'correlacion',
      recipient: 'pruebas@arza-one.test',
    },
    ...overrides,
  };
}

describe('registro de un trabajo', () => {
  it('incluye identificador, intento, empresa y correlación, nunca el destinatario', () => {
    const described = describeJob(job());
    expect(described).toEqual({
      job_id: '7',
      job_name: 'platform.example-email',
      queue: 'platform',
      attempt: 1,
      max_attempts: 6,
      tenant_id: 'empresa',
      correlation_id: 'correlacion',
    });
    expect(JSON.stringify(described)).not.toContain('pruebas@arza-one.test');
  });

  it('tolera trabajos sin datos o sin trabajo', () => {
    expect(describeJob(job({ data: null }))).toMatchObject({ tenant_id: undefined });
    expect(describeJob(job({ data: {} }))).toMatchObject({ correlation_id: undefined });
    expect(describeJob(undefined)).toEqual({});
  });
});

describe('clave de un trabajo', () => {
  it('une la cola y el identificador', () => {
    expect(jobKey(job())).toBe('platform:7');
    expect(jobKey({ queueName: 'platform' })).toBe('platform:sin-id');
    expect(jobKey(undefined)).toBeUndefined();
  });
});

describe('¿se reintentará?', () => {
  const failure = new Error('SMTP sin respuesta');

  it('sí, mientras queden intentos', () => {
    expect(willRetry(job({ attemptsMade: 5 }), failure)).toBe(true);
  });

  it('no, agotados los intentos', () => {
    expect(willRetry(job({ attemptsMade: 6 }), failure)).toBe(false);
    expect(willRetry(job({ attemptsMade: 1, opts: {} }), failure)).toBe(false);
  });

  it('no, si el error lo prohíbe o no hay trabajo', () => {
    expect(willRetry(job(), new UnrecoverableError('datos inválidos'))).toBe(false);
    expect(willRetry(undefined, failure)).toBe(false);
  });
});

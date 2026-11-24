import { describe, expect, it } from 'vitest';

import { monitorTokenMatches } from '../access/monitor-token.js';
import { errorEvent, glitchTipReporter, parseDsn, scrubMessage } from './error-reporter.js';
import { opsAlerts } from './ops-thresholds.js';
import { RequestMetrics } from './request-metrics.js';

const MINUTE = 60_000;
const NOW = Date.UTC(2026, 10, 24, 15, 0);

describe('cifras de peticiones de los últimos 10 minutos', () => {
  it('sin peticiones no hay percentil ni tasa', () => {
    expect(new RequestMetrics().summary(NOW)).toEqual({
      requests: 0,
      p95Ms: null,
      errorRate: null,
    });
  });

  it('calcula el percentil 95 y la tasa de 5xx', () => {
    const metrics = new RequestMetrics();
    for (let ms = 1; ms <= 100; ms += 1) metrics.record(NOW, ms, ms <= 2 ? 500 : 200);
    expect(metrics.summary(NOW)).toEqual({ requests: 100, p95Ms: 95, errorRate: 0.02 });
  });

  it('olvida lo que tiene más de 10 minutos', () => {
    const metrics = new RequestMetrics();
    metrics.record(NOW - 11 * MINUTE, 5000, 500);
    metrics.record(NOW - 9 * MINUTE, 10, 200);
    expect(metrics.summary(NOW)).toEqual({ requests: 1, p95Ms: 10, errorRate: 0 });
  });
});

describe('umbrales del numeral 10.7', () => {
  const calm = { requests: 500, p95Ms: 120, errorRate: 0 };
  const queue = { pending: 0, failed: 0 };

  it('sin nada fuera de lo normal no alerta', () => {
    expect(opsAlerts(calm, queue)).toEqual([]);
  });

  it('percentil 95 sobre 800 ms', () => {
    expect(opsAlerts({ ...calm, p95Ms: 800 }, queue)).toEqual([]);
    expect(opsAlerts({ ...calm, p95Ms: 801 }, queue)).toEqual(['slow_api']);
  });

  it('errores sobre 1 %, solo con al menos 100 peticiones', () => {
    expect(opsAlerts({ ...calm, errorRate: 0.011 }, queue)).toEqual(['error_rate']);
    expect(opsAlerts({ requests: 99, p95Ms: 10, errorRate: 0.5 }, queue)).toEqual([]);
  });

  it('más de 100 trabajos en espera o fallidos', () => {
    expect(opsAlerts(calm, { pending: 100, failed: 100 })).toEqual([]);
    expect(opsAlerts(calm, { pending: 101, failed: 101 })).toEqual([
      'queue_backlog',
      'queue_failed',
    ]);
  });
});

describe('llave de los vigilantes', () => {
  const token = 'una-llave-de-prueba-con-mas-de-32-caracteres';

  it('acepta solo «Bearer» con la llave exacta', () => {
    expect(monitorTokenMatches(`Bearer ${token}`, token)).toBe(true);
    expect(monitorTokenMatches(token, token)).toBe(false);
    expect(monitorTokenMatches(`Bearer ${token}x`, token)).toBe(false);
    expect(monitorTokenMatches(undefined, token)).toBe(false);
  });

  it('sin llave configurada no acepta nada', () => {
    expect(monitorTokenMatches('Bearer algo', undefined)).toBe(false);
  });
});

describe('envío de errores a GlitchTip', () => {
  it('lee la dirección del proyecto', () => {
    expect(parseDsn('https://llavepublica@errores.arza.test/7')).toEqual({
      storeUrl: 'https://errores.arza.test/api/7/store/',
      publicKey: 'llavepublica',
    });
    expect(() => parseDsn('https://errores.arza.test/7')).toThrow();
  });

  it('quita correos, números largos y valores entre comillas del mensaje', () => {
    expect(scrubMessage('No existe ana.perez@correo.test con cédula 1020304050 y "Ana"')).toBe(
      'No existe [correo] con cédula [número] y [valor]',
    );
  });
});

describe('evento y envío a GlitchTip', () => {
  const settings = { environment: 'production', release: 'abc123', service: 'api' as const };

  it('el evento lleva el tipo, el mensaje depurado, la pila y la correlación; nada más', () => {
    const event = errorEvent(new TypeError('falló con 9876543210'), settings, {
      correlationId: 'corr-1',
      where: 'GET /v1/parties/:id',
    });
    expect(event).toMatchObject({
      level: 'error',
      environment: 'production',
      release: 'abc123',
      transaction: 'GET /v1/parties/:id',
      tags: { service: 'api', correlation_id: 'corr-1' },
      exception: { values: [{ type: 'TypeError', value: 'falló con [número]' }] },
    });
    expect(JSON.stringify(event)).not.toContain('9876543210');
    expect(Object.keys(event)).not.toContain('request');
  });

  it('envía al punto «store» con la llave pública y nunca lanza si GlitchTip falla', async () => {
    const calls: { url: string; init: RequestInit }[] = [];
    const reporter = glitchTipReporter(
      { ...settings, dsn: 'https://llavepublica@errores.arza.test/7' },
      (url, init) => {
        calls.push({ url, init });
        return Promise.reject(new Error('sin red'));
      },
    );
    expect(() => {
      reporter.report(new Error('algo'));
    }).not.toThrow();
    await Promise.resolve();
    expect(calls[0]?.url).toBe('https://errores.arza.test/api/7/store/');
    expect(JSON.stringify(calls[0]?.init.headers)).toContain('sentry_key=llavepublica');
  });
});

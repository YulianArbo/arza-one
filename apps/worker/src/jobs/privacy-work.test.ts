import { describe, expect, it, vi } from 'vitest';

import {
  processPrivacyDailyWork,
  processPrivacyWork,
  type PrivacyJobDependencies,
} from './privacy-work.js';

// El recorrido completo, con PostgreSQL real, está en las pruebas de integración de Privacidad de
// la API (test/int/privacy). Aquí se revisa cómo el trabajo suma lo hecho en cada empresa.

const TENANTS = ['empresa-uno', 'empresa-dos'];

vi.mock('@arza/api/privacy', () => ({
  runPrivacyWork: vi.fn(async () => Promise.resolve({ mails: 3, exports: 1 })),
  tenantsWithPrivacyDailyWork: vi.fn(async () => Promise.resolve(TENANTS)),
  runPrivacyDailyIn: vi.fn(async (_deps: unknown, tenantId: string) =>
    Promise.resolve(
      tenantId === 'empresa-uno'
        ? { alerts: 2, desisted: 1, cookiesPurged: 4 }
        : { alerts: 1, desisted: 0, cookiesPurged: 0 },
    ),
  ),
}));

vi.mock('@arza/api/web', () => ({
  anonymizeExpiredSubmissions: vi.fn(async (_deps: unknown, tenantId: string) =>
    Promise.resolve(tenantId === 'empresa-dos' ? 5 : 0),
  ),
}));

function dependencies(): PrivacyJobDependencies {
  return {
    database: {
      withTenant: async () => Promise.reject(new Error('no se usa')),
      withoutTenant: async () => Promise.reject(new Error('no se usa')),
    },
    clock: { now: () => new Date('2026-11-23T12:00:00.000Z') },
    mailer: { send: async () => Promise.reject(new Error('no se usa')) },
    storage: {
      read: async () => Promise.reject(new Error('no se usa')),
      put: async () => Promise.reject(new Error('no se usa')),
      delete: async () => Promise.reject(new Error('no se usa')),
    },
    convertHtml: async () => Promise.reject(new Error('no se usa')),
  };
}

describe('trabajo de Privacidad', () => {
  it('envía los correos y prepara las entregas pendientes', async () => {
    expect(await processPrivacyWork(dependencies())).toEqual({ mails: 3, exports: 1 });
  });

  it('el trabajo diario suma avisos, desistimientos, cookies y formularios de cada empresa', async () => {
    expect(await processPrivacyDailyWork(dependencies())).toEqual({
      alerts: 3,
      desisted: 1,
      cookiesPurged: 4,
      formsAnonymized: 5,
    });
  });
});

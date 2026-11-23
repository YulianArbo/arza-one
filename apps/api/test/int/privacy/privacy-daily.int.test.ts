import { v7 as uuidv7 } from 'uuid';
import { describe, expect, it } from 'vitest';

import { anonymizeExpiredSubmissions } from '../../../src/modules/web/index.js';
import {
  runPrivacyDailyIn,
  tenantsWithPrivacyDailyWork,
} from '../../../src/modules/privacy/index.js';
import { RequestScenario } from './support/request-scenario.js';
import { apiDatabase } from '../support/integration-database.js';

// Trabajo diario de Privacidad (B42; decisiones 4, 10 y 11): avisos al Oficial a dos días hábiles
// y el día del vencimiento, una sola vez por fecha; cierre por desistimiento del reclamo que en dos
// meses no se completó; cookies de más de tres años borradas y formularios de más de dos anónimos.

const scenario = new RequestScenario('privacidad trabajo diario');
const DAY = 86_400_000;

function daysLater(days: number): { now: () => Date } {
  const at = new Date(scenario.clock.now().getTime() + days * DAY);
  return { now: () => at };
}

async function daily(days: number) {
  return runPrivacyDailyIn({ database: apiDatabase(), clock: daysLater(days) }, scenario.tenant.id);
}

async function outboxEvents(type: string): Promise<number> {
  return scenario.inTenant((tx) => tx.outboxEvent.count({ where: { eventType: type } }));
}

/** Un formulario recibido hace tres años; devuelve su código. */
async function oldSubmission(): Promise<string> {
  const noticeId = await scenario.contactNotice();
  const partyId = await scenario.holder();
  const consent = await scenario.inTenant((tx) =>
    tx.privacyConsent.findFirstOrThrow({ where: { partyId } }),
  );
  const old = new Date(scenario.clock.now().getTime() - 3 * 365 * DAY);
  const code = `FRM-1999-${String(Date.now()).slice(-8)}`;
  const data = {
    first_name: 'Antiguo',
    last_name: 'Visitante',
    phone: null,
    company: null,
    detail: 'Hola',
  };
  await scenario.inTenant((tx) =>
    tx.webFormSubmission.create({
      data: {
        tenantId: scenario.tenant.id,
        code,
        formKey: 'contact',
        email: 'antiguo@ejemplo.test',
        data,
        noticeId,
        noticeVersion: 1,
        consentId: consent.id,
        receivedAt: old,
        mailPending: false,
      },
    }),
  );
  return code;
}

describe('avisos de plazo', () => {
  it('avisa antes del vencimiento y el día del vencimiento, sin repetir', async () => {
    const dpo = await scenario.officer();
    const id = await scenario.fileInternal(dpo);
    const request = await scenario.privacyRequest(dpo, id);
    const dueIn = Math.round(
      (new Date(`${request.due_on ?? ''}T12:00:00Z`).getTime() - scenario.clock.now().getTime()) /
        DAY,
    );
    const warnedBefore = await outboxEvents('privacy.request.warned');
    await daily(dueIn - 1);
    await daily(dueIn - 1);
    expect(await outboxEvents('privacy.request.warned')).toBe(warnedBefore + 1);
    const dueBefore = await outboxEvents('privacy.request.due');
    await daily(dueIn + 1);
    await daily(dueIn + 2);
    expect(await outboxEvents('privacy.request.due')).toBe(dueBefore + 1);
  });
});

describe('avisos de plazo', () => {
  it('el incidente sin reportar también avisa', async () => {
    const dpo = await scenario.officer();
    await scenario.incident(dpo);
    const before = await outboxEvents('privacy.incident.due');
    await daily(30);
    expect(await outboxEvents('privacy.incident.due')).toBe(before + 1);
  });
});

describe('desistimiento', () => {
  it('el reclamo que en dos meses no se completó se cierra y se le avisa al titular', async () => {
    const dpo = await scenario.officer();
    const id = await scenario.fileInternal(dpo, { right: 'complaint' });
    await scenario.step(dpo, id, 'require', { text: 'Indique cuál fue el incumplimiento.' });
    await daily(30);
    expect((await scenario.privacyRequest(dpo, id)).status).toBe('received');
    await daily(63);
    const closed = await scenario.privacyRequest(dpo, id);
    expect(closed.closure).toBe('desisted');
    await scenario.work();
    const mails = scenario.mailsTo(closed.requester_email ?? '');
    expect(mails.some((mail) => mail.subject.includes('Cerramos'))).toBe(true);
  });
});

describe('retención', () => {
  it('borra las elecciones de cookies de más de tres años', async () => {
    const visitorId = uuidv7();
    const old = new Date(scenario.clock.now().getTime() - 4 * 365 * DAY);
    await scenario.inTenant((tx) =>
      tx.privacyCookieConsent.create({
        data: {
          tenantId: scenario.tenant.id,
          visitorId,
          policyVersion: 1,
          categories: ['necessary'],
          decidedAt: old,
          ipTruncated: null,
        },
      }),
    );
    const tenants = await tenantsWithPrivacyDailyWork(apiDatabase(), scenario.clock.now());
    expect(tenants).toContain(scenario.tenant.id);
    const result = await daily(0);
    expect(result.cookiesPurged).toBeGreaterThanOrEqual(1);
    const left = await scenario.inTenant((tx) =>
      tx.privacyCookieConsent.count({ where: { visitorId } }),
    );
    expect(left).toBe(0);
  });
});

describe('retención', () => {
  it('vuelve anónimos los formularios del sitio de más de dos años', async () => {
    const code = await oldSubmission();
    const anonymized = await anonymizeExpiredSubmissions(
      { database: apiDatabase(), clock: scenario.clock },
      scenario.tenant.id,
    );
    expect(anonymized).toBeGreaterThanOrEqual(1);
    const row = await scenario.inTenant((tx) =>
      tx.webFormSubmission.findFirstOrThrow({ where: { code } }),
    );
    expect(row.email).toBeNull();
    expect(row.anonymizedAt).not.toBeNull();
  });
});

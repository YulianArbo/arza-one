import {
  cookieConsentResponseSchema,
  publicFormInfoSchema,
  submissionListResponseSchema,
  unsubscribeListResponseSchema,
  unsubscribeResultSchema,
} from '@arza/contracts';
import { expect, it } from 'vitest';
import { v7 as uuidv7 } from 'uuid';

import { isUnsubscribed } from '../../../src/modules/web/index.js';
import { tenantScope } from '../iam/support/iam-fixtures.js';
import { contactNoticeId } from '../party/support/party-scenario.js';
import { SiteScenario, unsubscribeToken } from './support/site-scenario.js';

// Formularios de contacto y cotización (B41, decisión 7), acuse con baja en un clic (decisión 9) y
// elección de cookies (numeral 20.4). Es el único archivo que corre el worker del sitio en su
// empresa: así ningún otro se lleva sus correos. Datos ficticios.

const scenario = new SiteScenario('sitio formularios');

it('muestra el aviso de autorización vigente que acompaña al formulario', async () => {
  const noticeId = await contactNoticeId(scenario);
  const info = publicFormInfoSchema.parse((await scenario.publicGet('forms/notice')).body);
  expect(info.available).toBe(true);
  expect(info.notice?.id).toBe(noticeId);
});

it('el contacto crea el prospecto con su tarea y la versión exacta del aviso aceptado', async () => {
  const form = await scenario.contactForm();
  const receipt = await scenario.submit('contact', form);
  expect(receipt.code).toMatch(/^FRM-\d{4}-\d{4,}$/u);
  const row = await scenario.inTenant((tx) =>
    tx.webFormSubmission.findFirstOrThrow({ where: { code: receipt.code } }),
  );
  const lead = await scenario.inTenant((tx) =>
    tx.crmLead.findFirstOrThrow({ where: { id: row.createdLeadId ?? '' } }),
  );
  expect(lead).toMatchObject({ source: 'WEBSITE', ownerId: null, status: 'new' });
  expect(lead.need).toContain('software a la medida');
  expect(lead.workflowInstanceId).not.toBeNull();
  const consent = await scenario.inTenant((tx) =>
    tx.privacyConsent.findFirstOrThrow({ where: { id: lead.consentId } }),
  );
  expect(consent).toMatchObject({ noticeId: form['notice_id'], channel: 'digital' });
  expect(consent.ipAddress).not.toBeNull();
  expect(row.noticeVersion).toBeGreaterThan(0);
});

it('la cotización lleva el servicio y el plazo a la necesidad del prospecto', async () => {
  const receipt = await scenario.submit('quote', await scenario.quoteForm());
  const lead = await scenario.inTenant(async (tx) => {
    const row = await tx.webFormSubmission.findFirstOrThrow({ where: { code: receipt.code } });
    return tx.crmLead.findFirstOrThrow({ where: { id: row.createdLeadId ?? '' } });
  });
  expect(lead.need).toContain('Infraestructura cloud');
  expect(lead.need).toContain('en los próximos tres meses');
});

it('sin la casilla, con un aviso viejo o con el campo trampa no se guarda nada', async () => {
  const before = await scenario.inTenant((tx) => tx.webFormSubmission.count());
  const unchecked = await scenario.public(
    'forms/contact',
    await scenario.contactForm({ accept_privacy: false }),
  );
  expect(unchecked.status).toBe(422);
  const stale = await scenario.public(
    'forms/contact',
    await scenario.contactForm({ notice_id: uuidv7() }),
  );
  expect(stale.status).toBe(409);
  const robot = await scenario.public(
    'forms/quote',
    await scenario.quoteForm({ nickname: 'robot' }),
  );
  expect(robot.status).toBe(201);
  expect(await scenario.inTenant((tx) => tx.webFormSubmission.count())).toBe(before);
});

it('los ve quien tiene permiso, solo de su empresa', async () => {
  const receipt = await scenario.submit('contact', await scenario.contactForm());
  const [sales, worker, stranger] = await Promise.all([
    scenario.person('comercial', ['COMERCIAL']),
    scenario.person('colaborador', ['COLABORADOR']),
    scenario.person('comercial-ajeno', ['COMERCIAL'], { tenantId: scenario.otherTenant.id }),
  ]);
  expect((await scenario.get('/v1/site/submissions', worker.session)).status).toBe(403);
  expect((await scenario.get('/v1/site/unsubscribes', worker.session)).status).toBe(403);
  const mine = submissionListResponseSchema.parse(
    (await scenario.get('/v1/site/submissions?form_key=contact', sales.session)).body,
  );
  expect(mine.data.find((row) => row.code === receipt.code)).toMatchObject({
    form_key: 'contact',
    lead: { code: expect.stringMatching(/^LEA-/u) as unknown },
  });
  const theirs = submissionListResponseSchema.parse(
    (await scenario.get('/v1/site/submissions', stranger.session)).body,
  );
  expect(theirs.data.find((row) => row.code === receipt.code)).toBeUndefined();
  const elsewhere = await tenantScope(
    scenario.db,
    scenario.otherTenant.id,
  )((tx) => tx.webFormSubmission.count({ where: { code: receipt.code } }));
  expect(elsewhere).toBe(0);
});

it('el acuse trae el enlace de baja, que funciona en un clic y una sola vez', async () => {
  const form = await scenario.contactForm();
  const email = String(form['email']);
  const receipt = await scenario.submit('contact', form);
  expect(await scenario.siteWork()).toBeGreaterThan(0);
  const [mail] = scenario.mailsTo(email);
  if (mail === undefined) throw new Error('No llegó el acuse.');
  expect(mail.subject).toContain(receipt.code);
  const token = unsubscribeToken(mail);
  expect(await scenario.siteWork()).toBe(0);

  const first = unsubscribeResultSchema.parse(
    (await scenario.public('unsubscribe', { token })).body,
  );
  expect(first).toEqual({ email: `v•••@ejemplo.test`, already: false });
  const second = unsubscribeResultSchema.parse(
    (await scenario.public('unsubscribe', { token })).body,
  );
  expect(second.already).toBe(true);
  const bogus = await scenario.public('unsubscribe', { token: 'x'.repeat(43) });
  expect(bogus.status).toBe(404);
  expect(await scenario.inTenant((tx) => isUnsubscribed(tx, email.toUpperCase()))).toBe(true);
  const sales = await scenario.person('comercial-bajas', ['COMERCIAL']);
  const list = unsubscribeListResponseSchema.parse(
    (await scenario.get('/v1/site/unsubscribes', sales.session)).body,
  );
  expect(list.data.map((row) => row.email)).toContain(email);
  const row = await scenario.inTenant((tx) =>
    tx.webFormSubmission.findFirstOrThrow({ where: { code: receipt.code } }),
  );
  expect(row.unsubscribeTokenHash).not.toContain(token);
  expect(row.ackSentAt).not.toBeNull();
});

function consent(visitor: string, version: number, preferences: boolean) {
  return scenario.public('cookie-consent', {
    visitor_id: visitor,
    policy_version: version,
    choice: { preferences },
  });
}

it('se registra con la versión de la política, las categorías y la IP truncada', async () => {
  const [officer, director] = await Promise.all([
    scenario.person('oficial', ['OFICIAL_DATOS']),
    scenario.person('direccion', ['DIRECCION']),
  ]);
  expect((await consent(uuidv7(), 1, true)).status).toBe(503);
  await scenario.publishText('cookie_policy', { drafter: officer, approver: director });
  const visitor = uuidv7();
  expect((await consent(visitor, 9, false)).status).toBe(409);
  const response = await consent(visitor, 1, false).set('X-Forwarded-For', '10.20.30.40');
  expect(response.status, response.text).toBe(201);
  cookieConsentResponseSchema.parse(response.body);
  const row = await scenario.inTenant((tx) =>
    tx.privacyCookieConsent.findFirstOrThrow({ where: { visitorId: visitor } }),
  );
  expect(row).toMatchObject({
    policyVersion: 1,
    categories: ['necessary'],
    ipTruncated: '10.20.30.0',
  });
  const audit = await scenario.inTenant((tx) =>
    tx.auditEvent.findFirstOrThrow({ where: { entityId: row.id } }),
  );
  expect(audit.action).toBe('privacy.cookie_consent.record');
  expect(JSON.stringify({ ...audit, seq: String(audit.seq) })).not.toContain('10.20.30.40');
});

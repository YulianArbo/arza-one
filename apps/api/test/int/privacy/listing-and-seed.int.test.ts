import { consentListResponseSchema, noticeListResponseSchema } from '@arza/contracts';
import { describe, expect, it } from 'vitest';

import { seedPrivacyDemo, seedPrivacyNotices } from '../../../src/modules/privacy/index.js';
import { systemClock } from '../../../src/platform/clock/clock.js';
import { errorCode } from '../iam/support/iam-fixtures.js';
import { apiDatabase } from '../support/integration-database.js';
import { NOTICE_BODY, PrivacyScenario } from './support/privacy-scenario.js';

// Listados de privacidad con filtros y páginas, y la semilla de los textos (B17): cargarla dos
// veces no duplica ni vuelve a publicar.

const scenario = new PrivacyScenario('listados de privacidad');

describe('listado de autorizaciones', () => {
  it('filtra por texto y estado y pasa de página con el cursor', async () => {
    const sales = await scenario.sales();
    const officer = await scenario.officer();
    for (let index = 0; index < 3; index += 1) {
      await scenario.party(sales, await scenario.personWithConsent());
    }
    const first = await scenario.get('/v1/consents?limit=2', officer.session);
    const page = consentListResponseSchema.parse(first.body);
    expect(page.data).toHaveLength(2);
    expect(page.next_cursor).not.toBeNull();
    const next = await scenario.get(
      `/v1/consents?limit=2&cursor=${page.next_cursor ?? ''}`,
      officer.session,
    );
    const ids = consentListResponseSchema.parse(next.body).data.map((row) => row.id);
    expect(ids).not.toContain(page.data[0]?.id);
    const byKey = await scenario.get(
      '/v1/consents?notice_key=authorization_customer',
      officer.session,
    );
    expect(consentListResponseSchema.parse(byKey.body).data).toEqual([]);
    const revoked = await scenario.get('/v1/consents?status=revoked', officer.session);
    expect(consentListResponseSchema.parse(revoked.body).data).toEqual([]);
  });
});

describe('listado de textos', () => {
  it('filtra por clase y estado', async () => {
    const officer = await scenario.officer();
    await scenario.contactNotice();
    const response = await scenario.get(
      '/v1/notices?key=authorization_contact&status=published',
      officer.session,
    );
    const data = noticeListResponseSchema.parse(response.body).data;
    expect(data.map((row) => [row.key, row.status])).toEqual([
      ['authorization_contact', 'published'],
    ]);
  });
});

describe('versiones que chocan', () => {
  it('publicar con una versión vieja responde «otra persona cambió»', async () => {
    const officer = await scenario.officer();
    await scenario.contactNotice();
    const draft = await scenario.draft(officer, 'authorization_employee', ['EMPLOYMENT']);
    const edit = { title: 'Colaboradores', body: NOTICE_BODY, purposes: ['EMPLOYMENT'] };
    await scenario.patch(`/v1/notices/${draft.id}`, officer.session, edit, draft.version);
    const stale = await scenario
      .post(`/v1/notices/${draft.id}/actions/publish`, officer.session)
      .set('If-Match', `"${String(draft.version)}"`);
    expect(errorCode(stale)).toBe('VERSION_CONFLICT');
    const wrong = await scenario.patch(
      `/v1/notices/${draft.id}`,
      officer.session,
      { ...edit, purposes: [] },
      draft.version + 1,
    );
    expect(errorCode(wrong)).toBe('PRIVACY_PURPOSE_INVALID');
  });
});

describe('semilla de los textos', () => {
  it('cargarla dos veces no duplica los borradores ni vuelve a publicar', async () => {
    const tenantId = scenario.otherTenant.id;
    await scenario.contactNotice(tenantId);
    const count = () =>
      scenario.db.withTenant({ tenantId, userId: null }, (tx) => tx.privacyNotice.count());
    const before = await count();
    await seedPrivacyNotices(apiDatabase(), [tenantId], systemClock);
    await seedPrivacyDemo(apiDatabase(), [tenantId], systemClock);
    expect(await count()).toBe(before);
  });
});

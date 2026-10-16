import { noticeListResponseSchema, noticeSchema } from '@arza/contracts';
import { beforeAll, describe, expect, it } from 'vitest';

import { errorCode } from '../iam/support/iam-fixtures.js';
import { NOTICE_BODY, PrivacyScenario } from './support/privacy-scenario.js';

// Avisos y políticas versionados (B17, ficha 17.19): borrador → publicado → reemplazado, lo
// publicado no cambia, un borrador a la vez, finalidades del catálogo y auditoría.

const scenario = new PrivacyScenario('avisos de privacidad');

beforeAll(async () => {
  await scenario.contactNotice();
});

describe('versiones de un texto', () => {
  it('publicar una versión nueva reemplaza la vigente y queda en la auditoría', async () => {
    const officer = await scenario.officer();
    const draft = await scenario.draft(officer, 'authorization_customer', ['COMMERCIAL']);
    expect(draft).toMatchObject({ status: 'draft', version_number: 2, effective_from: null });
    const published = await scenario.publish(officer, draft);
    expect(published.status).toBe('published');
    expect(published.effective_from).not.toBeNull();
    const response = await scenario.get('/v1/notices?key=authorization_customer', officer.session);
    const versions = noticeListResponseSchema.parse(response.body).data;
    expect(versions.map((row) => [row.version_number, row.status])).toEqual([
      [2, 'published'],
      [1, 'replaced'],
    ]);
    const actions = await scenario.actionsBy(officer);
    expect(actions.filter((action) => action.startsWith('privacy.'))).toEqual([
      'privacy.notice.create',
      'privacy.notice.publish',
    ]);
  });
});

describe('versiones de un texto', () => {
  it('edita el borrador con la versión vista; lo publicado no cambia', async () => {
    const officer = await scenario.officer();
    const draft = await scenario.draft(officer, 'privacy_notice', []);
    const edit = { title: 'Aviso de privacidad 2026', body: NOTICE_BODY, purposes: [] };
    const path = `/v1/notices/${draft.id}`;
    const saved = await scenario.patch(path, officer.session, edit, draft.version);
    expect(saved.status, saved.text).toBe(200);
    const after = noticeSchema.parse(saved.body);
    expect(after.title).toBe('Aviso de privacidad 2026');
    const stale = await scenario.patch(path, officer.session, edit, draft.version);
    expect(errorCode(stale)).toBe('VERSION_CONFLICT');
    await scenario.publish(officer, after);
    const locked = await scenario.patch(path, officer.session, edit, after.version + 1);
    expect(errorCode(locked)).toBe('PRIVACY_NOTICE_NOT_EDITABLE');
    const again = await scenario
      .post(`${path}/actions/publish`, officer.session)
      .set('If-Match', `"${String(after.version + 1)}"`);
    expect(errorCode(again)).toBe('PRIVACY_NOTICE_NOT_EDITABLE');
  });
});

describe('versiones de un texto', () => {
  it('la base de datos tampoco deja cambiar un texto publicado', async () => {
    const officer = await scenario.officer();
    const published = await scenario.publish(
      officer,
      await scenario.draft(officer, 'privacy_policy', []),
    );
    const tamper = scenario.inTenant((tx) =>
      tx.privacyNotice.update({ where: { id: published.id }, data: { body: `${NOTICE_BODY} X` } }),
    );
    await expect(tamper).rejects.toThrow(/no se puede cambiar/);
  });
});

describe('reglas del borrador', () => {
  it('uno a la vez por clase de texto', async () => {
    const officer = await scenario.officer();
    await scenario.draft(officer, 'authorization_candidate', ['RECRUITMENT']);
    const body = {
      key: 'authorization_candidate',
      title: 'Otra',
      body: NOTICE_BODY,
      purposes: ['RECRUITMENT'],
    };
    const second = await scenario.post('/v1/notices', officer.session, body);
    expect(errorCode(second)).toBe('PRIVACY_NOTICE_DRAFT_EXISTS');
  });
});

describe('reglas del borrador', () => {
  it('solo finalidades activas del catálogo, y nunca el registro anterior a B17', async () => {
    const officer = await scenario.officer();
    const body = { key: 'authorization_employee', title: 'Colaboradores', body: NOTICE_BODY };
    const unknown = await scenario.post('/v1/notices', officer.session, {
      ...body,
      purposes: ['NOPE'],
    });
    expect(errorCode(unknown)).toBe('PRIVACY_PURPOSE_INVALID');
    const prior = await scenario.post('/v1/notices', officer.session, {
      ...body,
      key: 'authorization_prior',
      purposes: ['COMMERCIAL'],
    });
    expect(prior.status).toBe(422);
  });
});

describe('reglas del borrador', () => {
  it('el texto que no existe responde 404', async () => {
    const officer = await scenario.officer();
    const missing = await scenario.get(
      '/v1/notices/019a0000-0000-7000-8000-0000000000aa',
      officer.session,
    );
    expect(errorCode(missing)).toBe('PRIVACY_NOTICE_NOT_FOUND');
  });
});

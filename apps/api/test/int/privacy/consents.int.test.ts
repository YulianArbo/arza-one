import { consentListResponseSchema, consentSchema, partyDetailSchema } from '@arza/contracts';
import { describe, expect, it } from 'vitest';

import { errorCode, tenantScope } from '../iam/support/iam-fixtures.js';
import { consentFor, organizationBody, personBody } from '../party/support/party-scenario.js';
import { PrivacyScenario } from './support/privacy-scenario.js';

// Criterios del bloque B17: ningún formulario con datos personales se envía sin autorización
// registrada, y cada autorización guarda la versión del aviso aceptado.

const scenario = new PrivacyScenario('autorizaciones');

async function partiesNamed(lastName: string, tenantId = scenario.tenant.id): Promise<number> {
  return tenantScope(scenario.db, tenantId)((tx) => tx.party.count({ where: { lastName } }));
}

describe('ningún formulario con datos personales se envía sin autorización', () => {
  it('sin autorización o sin la casilla marcada, la persona no se guarda', async () => {
    const sales = await scenario.sales();
    const consent = await consentFor(scenario);
    const body = personBody({ last_name: 'Sin Autorización' });
    const missing = await scenario.post('/v1/parties', sales.session, body);
    expect(missing.status).toBe(422);
    const unchecked = await scenario.post('/v1/parties', sales.session, {
      ...body,
      consent: { ...consent, accepted: false },
    });
    expect(unchecked.status).toBe(422);
    expect(await partiesNamed('Sin Autorización')).toBe(0);
  });
});

describe('ningún formulario con datos personales se envía sin autorización', () => {
  it('si la autorización no vale, tampoco se guarda la persona', async () => {
    const sales = await scenario.sales();
    const consent = await consentFor(scenario);
    const body = personBody({ last_name: 'Autorización Inválida' });
    const cases = [
      [{ ...consent, purposes: ['BILLING'] }, 'PRIVACY_PURPOSE_INVALID'],
      [{ ...consent, granted_on: '2999-01-01' }, 'PRIVACY_GRANT_DATE_INVALID'],
      [
        { ...consent, notice_id: '019a0000-0000-7000-8000-0000000000bb' },
        'PRIVACY_NOTICE_NOT_PUBLISHED',
      ],
      [
        { ...consent, evidence_file_id: '019a0000-0000-7000-8000-0000000000cc' },
        'PRIVACY_EVIDENCE_INVALID',
      ],
    ] as const;
    for (const [grant, code] of cases) {
      const response = await scenario.post('/v1/parties', sales.session, {
        ...body,
        consent: grant,
      });
      expect(errorCode(response), response.text).toBe(code);
    }
    expect(await partiesNamed('Autorización Inválida')).toBe(0);
  });
});

describe('ningún formulario con datos personales se envía sin autorización', () => {
  it('una organización no lleva autorización', async () => {
    const sales = await scenario.sales();
    const response = await scenario.post('/v1/parties', sales.session, {
      ...organizationBody(),
      consent: await consentFor(scenario),
    });
    expect(response.status).toBe(422);
  });
});

describe('cada autorización guarda la versión del aviso aceptado', () => {
  it('la autorización queda con el texto exacto, la evidencia y su auditoría', async () => {
    const sales = await scenario.sales();
    const officer = await scenario.officer();
    const noticeId = await scenario.contactNotice();
    const id = await scenario.party(sales, await scenario.personWithConsent());
    const detail = await scenario.detail(sales, id);
    const [summary] = detail.authorizations;
    expect(summary?.notice.id).toBe(noticeId);
    const response = await scenario.get(`/v1/consents/${summary?.id ?? ''}`, officer.session);
    const consent = consentSchema.parse(response.body);
    expect(consent).toMatchObject({
      party: { id },
      notice: { id: noticeId, key: 'authorization_contact' },
      source: 'party_create',
      status: 'active',
    });
    expect(consent.evidence.ip_address).not.toBeNull();
    expect(consent.evidence.recorded_by).not.toBeNull();
    expect(await scenario.actionsBy(sales)).toContain('privacy.consent.grant');
  });
});

describe('cada autorización guarda la versión del aviso aceptado', () => {
  // En la otra empresa, para no cambiar el texto vigente que usan las demás pruebas.
  it('si el texto cambió mientras se llenaba el formulario, pide leer el nuevo', async () => {
    const tenantId = scenario.otherTenant.id;
    const sales = await scenario.sales(tenantId);
    const officer = await scenario.officer(tenantId);
    const consent = await consentFor(scenario, tenantId);
    const draft = await scenario.draft(officer, 'authorization_contact', ['COMMERCIAL']);
    await scenario.publish(officer, draft);
    const body = { ...personBody({ last_name: 'Texto Viejo' }), consent };
    const response = await scenario.post('/v1/parties', sales.session, body);
    expect(errorCode(response)).toBe('PRIVACY_NOTICE_OUTDATED');
    expect(await partiesNamed('Texto Viejo', tenantId)).toBe(0);
    const fresh = { ...consent, notice_id: draft.id };
    const saved = await scenario.post('/v1/parties', sales.session, { ...body, consent: fresh });
    expect(saved.status, saved.text).toBe(201);
  });
});

describe('cada autorización guarda la versión del aviso aceptado', () => {
  it('la base de datos no acepta autorizaciones sobre borradores ni cambios', async () => {
    const officer = await scenario.officer();
    const draft = await scenario.draft(officer, 'authorization_supplier', ['SUPPLIER']);
    const sales = await scenario.sales();
    const person = await scenario.party(sales, await scenario.personWithConsent());
    const base = {
      tenantId: scenario.tenant.id,
      partyId: person,
      purposes: ['SUPPLIER'],
      channel: 'written',
      grantedOn: new Date('2026-10-01'),
      source: 'party_consent',
    };
    const onDraft = scenario.inTenant((tx) =>
      tx.privacyConsent.create({ data: { ...base, noticeId: draft.id } }),
    );
    await expect(onDraft).rejects.toThrow(/texto de autorización publicado/);
    const tamper = scenario.inTenant((tx) =>
      tx.privacyConsent.updateMany({ where: { partyId: person }, data: { channel: 'verbal' } }),
    );
    await expect(tamper).rejects.toThrow(/no se edita/);
  });
});

describe('autorización nueva y revocatoria', () => {
  it('registra otra autorización de la persona desde su ficha', async () => {
    const sales = await scenario.sales();
    const person = await scenario.party(sales, await scenario.personWithConsent());
    const org = await scenario.party(sales);
    const grant = { ...(await consentFor(scenario)), purposes: ['SUPPORT'] };
    const added = await scenario.post(`/v1/parties/${person}/consents`, sales.session, grant);
    expect(added.status, added.text).toBe(201);
    const detail = partyDetailSchema.parse(
      (await scenario.get(`/v1/parties/${person}`, sales.session)).body,
    );
    expect(detail.authorizations.map((row) => row.purposes)).toEqual(
      expect.arrayContaining([['SUPPORT'], ['COMMERCIAL']]),
    );
    const toOrg = await scenario.post(`/v1/parties/${org}/consents`, sales.session, grant);
    expect(errorCode(toOrg)).toBe('PARTY_CONSENT_NOT_ALLOWED');
  });
});

describe('autorización nueva y revocatoria', () => {
  it('el Oficial revoca una sola vez y con motivo; la autorización no se borra', async () => {
    const sales = await scenario.sales();
    const officer = await scenario.officer();
    const person = await scenario.party(sales, await scenario.personWithConsent());
    const list = await scenario.get(`/v1/consents?party_id=${person}`, officer.session);
    const [consent] = consentListResponseSchema.parse(list.body).data;
    const path = `/v1/consents/${consent?.id ?? ''}/actions/revoke`;
    const noReason = await scenario.post(path, officer.session, { reason: 'No' });
    expect(noReason.status).toBe(422);
    const revoked = await scenario.post(path, officer.session, { reason: 'Lo pidió el titular' });
    expect(revoked.status, revoked.text).toBe(200);
    expect(consentSchema.parse(revoked.body)).toMatchObject({
      status: 'revoked',
      revocation_reason: 'Lo pidió el titular',
    });
    const twice = await scenario.post(path, officer.session, { reason: 'Otra vez' });
    expect(errorCode(twice)).toBe('PRIVACY_CONSENT_REVOKED');
    const active = await scenario.get(
      `/v1/consents?party_id=${person}&status=active`,
      officer.session,
    );
    expect(consentListResponseSchema.parse(active.body).data).toEqual([]);
    expect(await scenario.actionsBy(officer)).toContain('privacy.consent.revoke');
  });
});

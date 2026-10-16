import { consentListResponseSchema, createdResponseSchema } from '@arza/contracts';
import { describe, expect, it } from 'vitest';

import { errorCode } from '../iam/support/iam-fixtures.js';
import { consentFor, personBody } from '../party/support/party-scenario.js';
import { PrivacyScenario } from './support/privacy-scenario.js';

// Permiso denegado y aislamiento entre empresas de privacidad (B17, capítulo 21, numerales 15.3 y
// 15.5): el Oficial administra; Dirección, Calidad y el Auditor solo leen las autorizaciones; el
// colaborador ve las que él registró; nadie de otra empresa ve ni usa nada.

const scenario = new PrivacyScenario('privacidad acceso');
const ADMIN_ROUTES = ['/v1/notices', '/v1/processing-activities', '/v1/processors'];

describe('permiso denegado', () => {
  it('comercial, administración de la plataforma y el portal no entran a privacidad', async () => {
    const people = [
      await scenario.sales(),
      await scenario.person('admin-plataforma', ['ADMIN_PLATAFORMA']),
      await scenario.person('portal', ['CLIENTE_ADMIN'], { kind: 'portal' }),
    ];
    for (const person of people) {
      for (const path of [...ADMIN_ROUTES, '/v1/consents']) {
        expect(errorCode(await scenario.get(path, person.session)), path).toBe('PERMISSION_DENIED');
      }
    }
  });
});

describe('permiso denegado', () => {
  it('el Auditor y Dirección leen autorizaciones pero no revocan ni administran', async () => {
    const sales = await scenario.sales();
    await scenario.party(sales, await scenario.personWithConsent());
    for (const role of ['AUDITOR', 'DIRECCION'] as const) {
      const reader = await scenario.person(`lector-${role.toLowerCase()}`, [role]);
      const list = await scenario.get('/v1/consents', reader.session);
      expect(list.status, list.text).toBe(200);
      const [consent] = consentListResponseSchema.parse(list.body).data;
      const revoke = await scenario.post(
        `/v1/consents/${consent?.id ?? ''}/actions/revoke`,
        reader.session,
        { reason: 'Prueba de permiso' },
      );
      expect(errorCode(revoke)).toBe('PERMISSION_DENIED');
      expect(errorCode(await scenario.get('/v1/notices', reader.session))).toBe(
        'PERMISSION_DENIED',
      );
    }
  });
});

describe('permiso denegado', () => {
  it('el colaborador solo ve las autorizaciones que él registró', async () => {
    const collaborator = await scenario.person('colaborador', ['COLABORADOR']);
    const sales = await scenario.sales();
    await scenario.party(sales, await scenario.personWithConsent());
    const response = await scenario.get('/v1/consents', collaborator.session);
    expect(response.status, response.text).toBe(200);
    expect(consentListResponseSchema.parse(response.body).data).toEqual([]);
  });
});

describe('permiso denegado', () => {
  it('quien no edita terceros no registra autorizaciones en la ficha', async () => {
    const sales = await scenario.sales();
    const person = await scenario.party(sales, await scenario.personWithConsent());
    const officer = await scenario.officer();
    const grant = await consentFor(scenario);
    const response = await scenario.post(`/v1/parties/${person}/consents`, officer.session, grant);
    expect(errorCode(response)).toBe('PERMISSION_DENIED');
  });
});

describe('aislamiento entre empresas', () => {
  it('la otra empresa no ve los textos, autorizaciones, actividades ni encargados', async () => {
    const officer = await scenario.officer();
    const other = await scenario.officer(scenario.otherTenant.id);
    const sales = await scenario.sales();
    const noticeId = await scenario.contactNotice();
    const person = await scenario.party(sales, await scenario.personWithConsent());
    const processorBody = {
      party_id: await scenario.organization(sales),
      service: 'Nube',
      country: 'US',
      review_on: '2027-01-31',
    };
    const processor = await scenario.post('/v1/processors', officer.session, processorBody);
    const processorId = createdResponseSchema.parse(processor.body).id;
    const list = await scenario.get(`/v1/consents?party_id=${person}`, officer.session);
    const consentId = consentListResponseSchema.parse(list.body).data[0]?.id ?? '';
    const reads = [
      [`/v1/notices/${noticeId}`, 'PRIVACY_NOTICE_NOT_FOUND'],
      [`/v1/consents/${consentId}`, 'PRIVACY_CONSENT_NOT_FOUND'],
      [`/v1/processors/${processorId}`, 'PRIVACY_PROCESSOR_NOT_FOUND'],
    ] as const;
    for (const [path, code] of reads) {
      expect(errorCode(await scenario.get(path, other.session)), path).toBe(code);
    }
    const otherList = await scenario.get('/v1/consents', other.session);
    const ids = consentListResponseSchema.parse(otherList.body).data.map((row) => row.id);
    expect(ids).not.toContain(consentId);
    const revoke = await scenario.post(`/v1/consents/${consentId}/actions/revoke`, other.session, {
      reason: 'Intento de otra empresa',
    });
    expect(errorCode(revoke)).toBe('PRIVACY_CONSENT_NOT_FOUND');
  });
});

describe('aislamiento entre empresas', () => {
  it('la otra empresa no usa los textos ni los terceros de esta', async () => {
    const officer = await scenario.officer();
    const sales = await scenario.sales();
    const otherSales = await scenario.sales(scenario.otherTenant.id);
    const otherOfficer = await scenario.officer(scenario.otherTenant.id);
    const grant = await consentFor(scenario);
    const borrowed = await scenario.post('/v1/parties', otherSales.session, {
      ...personBody(),
      consent: grant,
    });
    expect(errorCode(borrowed)).toBe('PRIVACY_NOTICE_NOT_PUBLISHED');
    const processor = await scenario.post('/v1/processors', otherOfficer.session, {
      party_id: await scenario.organization(sales),
      service: 'Nube',
      country: 'US',
      review_on: '2027-01-31',
    });
    expect(errorCode(processor)).toBe('PRIVACY_PROCESSOR_INVALID');
    expect(officer.id).not.toBe(otherOfficer.id);
  });
});

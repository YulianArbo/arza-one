import { privacyRequestReceiptSchema, portalPrivacyRequestListSchema } from '@arza/contracts';
import { describe, expect, it } from 'vitest';

import { errorCode } from '../iam/support/iam-fixtures.js';
import { INCIDENTS, REQUESTS, RequestScenario } from './support/request-scenario.js';

// Permiso denegado y aislamiento entre empresas de las solicitudes de titulares, la entrega y
// supresión de datos, los incidentes y las cookies (B42; capítulo 21, numerales 15.3 y 15.5).

const scenario = new RequestScenario('privacidad solicitudes acceso');
const ROUTES = [
  REQUESTS,
  INCIDENTS,
  '/v1/privacy/cookie-consents/report?from=2026-01-01&to=2026-01-31',
];

describe('permiso denegado', () => {
  it('comercial, el colaborador y el auditor no entran a solicitudes, incidentes ni cookies', async () => {
    const people = [
      await scenario.sales(),
      await scenario.person('colaborador', ['COLABORADOR']),
      await scenario.person('auditor', ['AUDITOR']),
    ];
    for (const person of people) {
      for (const path of ROUTES) {
        expect(errorCode(await scenario.get(path, person.session)), path).toBe('PERMISSION_DENIED');
      }
    }
  });

  it('quien no tiene el permiso no entrega ni suprime los datos de un titular', async () => {
    const dpo = await scenario.officer();
    const partyId = await scenario.holder();
    const requestId = await scenario.verified(dpo, partyId, { right: 'erase' });
    const sales = await scenario.sales();
    for (const action of ['export', 'erase']) {
      const path = `/v1/parties/${partyId}/personal-data/${action}`;
      const response = await scenario.post(path, sales.session, { request_id: requestId });
      expect(errorCode(response), action).toBe('PERMISSION_DENIED');
    }
  });
});

describe('aislamiento entre empresas', () => {
  it('la otra empresa no ve ni mueve las solicitudes ni los incidentes', async () => {
    const dpo = await scenario.officer();
    const other = await scenario.officer(scenario.otherTenant.id);
    const id = await scenario.fileInternal(dpo);
    const incident = await scenario.incident(dpo);
    expect(errorCode(await scenario.get(`${REQUESTS}/${id}`, other.session))).toBe(
      'PRIVACY_REQUEST_NOT_FOUND',
    );
    const step = await scenario.act(
      `${REQUESTS}/${id}/actions/start-verification`,
      other.session,
      1,
    );
    expect(errorCode(step)).toBe('PRIVACY_REQUEST_NOT_FOUND');
    expect(errorCode(await scenario.get(`${INCIDENTS}/${incident}`, other.session))).toBe(
      'PRIVACY_INCIDENT_NOT_FOUND',
    );
    const list = await scenario.get(REQUESTS, other.session);
    expect(JSON.stringify(list.body)).not.toContain(id);
  });

  it('la otra empresa no entrega los datos de un titular ajeno', async () => {
    const dpo = await scenario.officer();
    const other = await scenario.officer(scenario.otherTenant.id);
    const partyId = await scenario.holder();
    const requestId = await scenario.verified(dpo, partyId);
    const path = `/v1/parties/${partyId}/personal-data/export`;
    const response = await scenario.post(path, other.session, { request_id: requestId });
    expect(errorCode(response)).toBe('PRIVACY_REQUEST_NOT_FOUND');
  });
});

describe('portal del cliente', () => {
  it('el cliente presenta su solicitud y solo ve las suyas', async () => {
    const client = await scenario.person('portal-cliente', ['CLIENTE_ADMIN'], { kind: 'portal' });
    const partyId = await scenario.holder();
    await scenario.inTenant((tx) =>
      tx.user.update({ where: { id: client.id }, data: { partyId } }),
    );
    const body = {
      right: 'usage',
      document_number: '1000000077',
      description: 'Quiero saber para qué usan mis datos.',
    };
    const filed = await scenario.post('/v1/portal/me/privacy-requests', client.session, body);
    expect(filed.status, filed.text).toBe(201);
    const { code } = privacyRequestReceiptSchema.parse(filed.body);
    const mine = await scenario.get('/v1/portal/me/privacy-requests', client.session);
    const list = portalPrivacyRequestListSchema.parse(mine.body).data;
    expect(list.map((item) => item.code)).toEqual([code]);
    expect(list[0]?.party?.id).toBe(partyId);
    const another = await scenario.person('portal-otro', ['CLIENTE_ADMIN'], { kind: 'portal' });
    const theirs = await scenario.get('/v1/portal/me/privacy-requests', another.session);
    expect(portalPrivacyRequestListSchema.parse(theirs.body).data).toEqual([]);
  });
});

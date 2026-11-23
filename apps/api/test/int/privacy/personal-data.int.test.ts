import {
  createdResponseSchema,
  erasureResultSchema,
  personalDataReportSchema,
  type ErasureResult,
} from '@arza/contracts';
import { v7 as uuidv7 } from 'uuid';
import { describe, expect, it } from 'vitest';

import { mayContactCommercially } from '../../../src/modules/web/index.js';
import type { Person } from '../iam/support/access-scenario.js';
import { errorCode } from '../iam/support/iam-fixtures.js';
import { RequestScenario, REQUESTS } from './support/request-scenario.js';

// Entrega y supresión de los datos de un titular (B42, ficha 17.19; decisiones 6, 7 y 8): solo
// desde una solicitud verificada del mismo titular; la entrega queda en PDF legible y en formato de
// datos; la supresión vuelve anónimo lo que se puede, revoca las autorizaciones (y con ello las
// comunicaciones comerciales) y bloquea con su motivo lo que la ley obliga a conservar.

const scenario = new RequestScenario('privacidad datos del titular');

function exportPath(partyId: string): string {
  return `/v1/parties/${partyId}/personal-data/export`;
}

function erasePath(partyId: string): string {
  return `/v1/parties/${partyId}/personal-data/erase`;
}

async function erase(dpo: Person, partyId: string, requestId: string): Promise<ErasureResult> {
  const response = await scenario.post(erasePath(partyId), dpo.session, { request_id: requestId });
  expect(response.status, response.text).toBe(200);
  return erasureResultSchema.parse(response.body);
}

async function marketingHolder(): Promise<string> {
  const body = await scenario.personWithConsent();
  const consent = { ...(body['consent'] as object), purposes: ['COMMERCIAL', 'MARKETING'] };
  return scenario.party(await scenario.sales(), { ...body, consent });
}

function sectionOf(result: ErasureResult, key: string) {
  return result.sections.find((section) => section.key === key);
}

describe('entrega de los datos', () => {
  it('reúne lo de todos los módulos y el worker deja listo el PDF', async () => {
    const dpo = await scenario.officer();
    const partyId = await scenario.holder();
    const requestId = await scenario.verified(dpo, partyId);
    const created = await scenario.post(exportPath(partyId), dpo.session, {
      request_id: requestId,
    });
    expect(created.status, created.text).toBe(201);
    const exportId = createdResponseSchema.parse(created.body).id;
    const pending = await scenario.privacyRequest(dpo, requestId);
    expect(pending.exports[0]?.status).toBe('pending');
    const early = await scenario.get(
      `${REQUESTS}/${requestId}/exports/${exportId}/pdf`,
      dpo.session,
    );
    expect(errorCode(early)).toBe('PRIVACY_EXPORT_NOT_READY');
    await scenario.work();
    const ready = await scenario.privacyRequest(dpo, requestId);
    expect(ready.exports[0]?.status).toBe('ready');
    const pdf = await scenario.get(`${REQUESTS}/${requestId}/exports/${exportId}/pdf`, dpo.session);
    expect(pdf.status).toBe(200);
    expect(pdf.headers['content-type']).toContain('application/pdf');
    const data = await scenario.get(
      `${REQUESTS}/${requestId}/exports/${exportId}/data`,
      dpo.session,
    );
    const report = personalDataReportSchema.parse(data.body);
    const titles = report.sections.map((section) => section.title);
    expect(titles).toContain('Ficha en Terceros');
    expect(titles).toContain('Autorizaciones de tratamiento');
    expect(report.request_code).toBe(ready.code);
  });
});

describe('entrega de los datos', () => {
  it('no se entregan los datos de otra persona ni sin verificar la identidad', async () => {
    const dpo = await scenario.officer();
    const partyId = await scenario.holder();
    const other = await scenario.holder();
    const requestId = await scenario.verified(dpo, partyId);
    const wrong = await scenario.post(exportPath(other), dpo.session, { request_id: requestId });
    expect(errorCode(wrong)).toBe('PRIVACY_REQUEST_STEP_INVALID');
    const unverified = await scenario.fileInternal(dpo);
    const early = await scenario.post(exportPath(partyId), dpo.session, { request_id: unverified });
    expect(errorCode(early)).toBe('PRIVACY_REQUEST_STEP_INVALID');
  });
});

describe('supresión', () => {
  it('vuelve anónima la ficha, revoca las autorizaciones y detiene las comunicaciones', async () => {
    const dpo = await scenario.officer();
    const partyId = await marketingHolder();
    const email = `titular.${uuidv7().slice(-8)}@ejemplo.test`;
    await scenario.inTenant((tx) => tx.party.update({ where: { id: partyId }, data: { email } }));
    const allowed = await scenario.inTenant((tx) => mayContactCommercially(tx, { email, partyId }));
    expect(allowed).toBe(true);
    const requestId = await scenario.verified(dpo, partyId, { right: 'erase' });
    const result = await erase(dpo, partyId, requestId);
    expect(sectionOf(result, '0-party')?.outcome).toBe('erased');
    expect(sectionOf(result, 'a-consents')?.outcome).toBe('kept');
    const party = await scenario.inTenant((tx) =>
      tx.party.findUniqueOrThrow({ where: { id: partyId } }),
    );
    expect([party.firstName, party.email, party.idNumber]).toEqual(['Titular', null, null]);
    const stopped = await scenario.inTenant((tx) => mayContactCommercially(tx, { email, partyId }));
    expect(stopped).toBe(false);
    const again = await scenario.post(erasePath(partyId), dpo.session, { request_id: requestId });
    expect(errorCode(again)).toBe('PRIVACY_REQUEST_STEP_INVALID');
  });
});

describe('supresión', () => {
  it('la historia laboral se conserva: la ficha queda bloqueada con su motivo', async () => {
    const dpo = await scenario.officer();
    const partyId = await scenario.holder();
    await scenario.inTenant(async (tx) => {
      const position = await tx.position.findFirstOrThrow({ where: { deletedAt: null } });
      await tx.hrEmployee.create({
        data: {
          tenantId: scenario.tenant.id,
          partyId,
          positionId: position.id,
          hireDate: new Date('2026-01-15T00:00:00.000Z'),
          contractType: 'indefinite',
          workMode: 'on_site',
          workEmail: `colaborador.${uuidv7().slice(-8)}@empresa.test`,
          requestKey: uuidv7(),
        },
      });
    });
    const requestId = await scenario.verified(dpo, partyId, { right: 'erase' });
    const result = await erase(dpo, partyId, requestId);
    expect(sectionOf(result, 'hr')?.outcome).toBe('blocked');
    expect(sectionOf(result, '0-party')?.outcome).toBe('blocked');
    const party = await scenario.inTenant((tx) =>
      tx.party.findUniqueOrThrow({ where: { id: partyId } }),
    );
    expect(party.dataBlockedAt).not.toBeNull();
    expect(party.dataBlockReason).toContain('Historia laboral');
    expect(party.firstName).not.toBe('Titular');
  });
});

describe('supresión', () => {
  it('con una cuenta del portal activa no se suprime', async () => {
    const dpo = await scenario.officer();
    const partyId = await scenario.holder();
    const client = await scenario.person('portal-titular', ['CLIENTE_USUARIO'], { kind: 'portal' });
    await scenario.inTenant((tx) =>
      tx.user.update({ where: { id: client.id }, data: { partyId } }),
    );
    const requestId = await scenario.verified(dpo, partyId, { right: 'erase' });
    const response = await scenario.post(erasePath(partyId), dpo.session, {
      request_id: requestId,
    });
    expect(errorCode(response)).toBe('PRIVACY_ACCOUNT_ACTIVE');
  });
});

describe('supresión', () => {
  it('solo se suprime cuando el titular pidió la supresión', async () => {
    const dpo = await scenario.officer();
    const partyId = await scenario.holder();
    const requestId = await scenario.verified(dpo, partyId);
    const response = await scenario.post(erasePath(partyId), dpo.session, {
      request_id: requestId,
    });
    expect(errorCode(response)).toBe('PRIVACY_REQUEST_STEP_INVALID');
  });
});

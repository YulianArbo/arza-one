import {
  createdResponseSchema,
  erasureResultSchema,
  personalDataReportSchema,
  type PersonalDataReport,
} from '@arza/contracts';
import { v7 as uuidv7 } from 'uuid';
import { describe, expect, it } from 'vitest';

import { candidateFixture } from '../hr/support/candidate-fixture.js';
import type { Person } from '../iam/support/access-scenario.js';
import { RequestScenario, REQUESTS } from './support/request-scenario.js';

// Titular con historia en varios módulos (B42, decisiones 6 y 8): escribió por el formulario de
// contacto del sitio y se dio de baja de las comunicaciones, o trabaja en la empresa. La entrega muestra el formulario con lo
// que escribió y la baja; al suprimir, el formulario queda anónimo y la baja se conserva como prueba.
// Datos ficticios.

const scenario = new RequestScenario('privacidad historia del titular');

/** Titular con correo, un formulario de contacto del sitio y su baja de comunicaciones. */
async function holderFromSite(): Promise<{ partyId: string; code: string }> {
  const noticeId = await scenario.contactNotice();
  const partyId = await scenario.holder();
  const email = `sitio.${uuidv7().slice(-8)}@ejemplo.test`;
  const code = `FRM-1999-${String(Date.now()).slice(-8)}`;
  await scenario.inTenant(async (tx) => {
    await tx.party.update({ where: { id: partyId }, data: { email } });
    const consent = await tx.privacyConsent.findFirstOrThrow({ where: { partyId } });
    const submission = await tx.webFormSubmission.create({
      data: {
        tenantId: scenario.tenant.id,
        code,
        formKey: 'contact',
        email,
        data: { first_name: 'Visitante', last_name: 'Del Sitio', phone: 42, detail: 'Hola' },
        noticeId,
        noticeVersion: 1,
        consentId: consent.id,
        receivedAt: scenario.clock.now(),
        mailPending: false,
      },
    });
    await tx.webUnsubscribe.create({
      data: {
        tenantId: scenario.tenant.id,
        email,
        source: 'ack_link',
        submissionId: submission.id,
        unsubscribedAt: scenario.clock.now(),
      },
    });
  });
  return { partyId, code };
}

async function report(dpo: Person, partyId: string): Promise<PersonalDataReport> {
  const requestId = await scenario.verified(dpo, partyId);
  const path = `/v1/parties/${partyId}/personal-data/export`;
  const created = await scenario.post(path, dpo.session, { request_id: requestId });
  expect(created.status, created.text).toBe(201);
  const exportId = createdResponseSchema.parse(created.body).id;
  const data = await scenario.get(`${REQUESTS}/${requestId}/exports/${exportId}/data`, dpo.session);
  return personalDataReportSchema.parse(data.body);
}

describe('entrega de los datos', () => {
  it('muestra el formulario del sitio con lo que escribió y la baja de comunicaciones', async () => {
    const dpo = await scenario.officer();
    const { partyId, code } = await holderFromSite();
    const site = (await report(dpo, partyId)).sections.find((section) => section.key === 'web');
    const titles = site?.records.map((record) => record.title) ?? [];
    expect(titles.some((title) => title.endsWith(code))).toBe(true);
    expect(titles).toContain('Baja de comunicaciones comerciales');
    const form = site?.records.find((record) => record.title.endsWith(code));
    const field = (label: string) => form?.fields.find((item) => item.label === label)?.value;
    expect([field('Nombres'), field('Teléfono')]).toEqual(['Visitante', null]);
  });
});

describe('supresión', () => {
  it('el formulario queda anónimo y la baja se conserva como prueba', async () => {
    const dpo = await scenario.officer();
    const { partyId, code } = await holderFromSite();
    const requestId = await scenario.verified(dpo, partyId, { right: 'erase' });
    const response = await scenario.post(
      `/v1/parties/${partyId}/personal-data/erase`,
      dpo.session,
      {
        request_id: requestId,
      },
    );
    expect(response.status, response.text).toBe(200);
    const site = erasureResultSchema
      .parse(response.body)
      .sections.find((section) => section.key === 'web');
    expect(site?.outcome).toBe('kept');
    const submission = await scenario.inTenant((tx) =>
      tx.webFormSubmission.findFirstOrThrow({ where: { code } }),
    );
    expect([submission.email, submission.anonymizedAt === null]).toEqual([null, false]);
  });
});

describe('entrega de los datos', () => {
  it('a un colaborador le muestra su vinculación con la empresa', async () => {
    const dpo = await scenario.officer();
    const partyId = await scenario.holder();
    const workEmail = `colaborador.${uuidv7().slice(-8)}@empresa.test`;
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
          workEmail,
          requestKey: uuidv7(),
        },
      });
    });
    const hr = (await report(dpo, partyId)).sections.find((section) => section.key === 'hr');
    const fields = hr?.records[0]?.fields ?? [];
    const value = (label: string) => fields.find((field) => field.label === label)?.value;
    expect([value('Ingreso'), value('Retiro'), value('Correo de trabajo')]).toEqual([
      '15/01/2026',
      null,
      workEmail,
    ]);
  });
});

describe('entrega de los datos', () => {
  it('un prospecto sin documento y con su relación terminada deja esos datos vacíos', async () => {
    const dpo = await scenario.officer();
    const partyId = await scenario.holder();
    await scenario.inTenant(async (tx) => {
      await tx.party.update({
        where: { id: partyId },
        data: { status: 'prospect', idType: null, idNumber: null, checkDigit: null },
      });
      await tx.partyRole.updateMany({ where: { partyId }, data: { status: 'ended' } });
    });
    const party = (await report(dpo, partyId)).sections.find(
      (section) => section.key === '0-party',
    );
    const fields = party?.records[0]?.fields ?? [];
    const value = (label: string) => fields.find((field) => field.label === label)?.value;
    expect([value('Documento'), value('Relación con la empresa')]).toEqual([null, null]);
  });
});

describe('supresión', () => {
  it('a quien solo se postuló a una vacante se le suprime la candidatura', async () => {
    const dpo = await scenario.officer();
    const partyId = await scenario.holder();
    const candidate = await candidateFixture(scenario);
    await scenario.inTenant((tx) =>
      tx.hrCandidate.update({ where: { id: candidate.id }, data: { partyId, talentBank: true } }),
    );
    const requestId = await scenario.verified(dpo, partyId, { right: 'erase' });
    const response = await scenario.post(
      `/v1/parties/${partyId}/personal-data/erase`,
      dpo.session,
      {
        request_id: requestId,
      },
    );
    expect(response.status, response.text).toBe(200);
    const hr = erasureResultSchema
      .parse(response.body)
      .sections.find((section) => section.key === 'hr');
    expect(hr?.outcome).toBe('erased');
    const erased = await scenario.inTenant((tx) =>
      tx.hrCandidate.findUniqueOrThrow({ where: { id: candidate.id } }),
    );
    expect([erased.erasedAt === null, erased.talentBank]).toEqual([false, false]);
  });
});

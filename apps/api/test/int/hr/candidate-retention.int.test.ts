import { hrCreatedResponseSchema } from '@arza/contracts';
import { expect, it } from 'vitest';

import { expireRecruitmentData } from '../../../src/modules/hr/index.js';
import { AccessScenario, type Person } from '../iam/support/access-scenario.js';
import { apiDatabase } from '../support/integration-database.js';
import { registrationBody } from './support/candidate-fixture.js';

const scenario = new AccessScenario('retención de selección');

function retentionDeps() {
  return { database: apiDatabase(), clock: scenario.clock };
}

/** Candidatura registrada y descartada; el banco de talento se decide al registrarla. */
async function discardCandidate(recruiter: Person, talentBank: boolean): Promise<string> {
  const body = await registrationBody(scenario);
  const created = await scenario
    .post('/v1/hr/candidates', recruiter.session, { ...body, talent_bank: talentBank })
    .set('Idempotency-Key', crypto.randomUUID());
  expect(created.status, created.text).toBe(201);
  const { id } = hrCreatedResponseSchema.parse(created.body);
  const response = await scenario
    .post(`/v1/hr/candidates/${id}/actions/discard`, recruiter.session, {
      reason: 'Motivo ficticio',
    })
    .set('If-Match', '"1"');
  expect(response.status, response.text).toBe(204);
  return id;
}

/** Antes del plazo no borra nada; vencido, dos pasadas anonimizan una sola vez. */
async function runRetention(expires: string): Promise<void> {
  const deps = retentionDeps();
  await expireRecruitmentData(deps);
  const available = await scenario.inTenant((tx) =>
    tx.hrCandidate.findUniqueOrThrow({ where: { id: expires } }),
  );
  expect(available.erasedAt).toBeNull();
  scenario.clock.advance(370 * 24 * 60 * 60 * 1000);
  await expireRecruitmentData(deps);
  await expireRecruitmentData(deps);
}

/** La candidatura queda anónima, con un solo rastro de borrado y sin autorización vigente. */
async function erasedData(expires: string, retains: string): Promise<void> {
  const rows = await scenario.inTenant(async (tx) => {
    const candidate = await tx.hrCandidate.findUniqueOrThrow({ where: { id: expires } });
    const person = await tx.party.findUniqueOrThrow({ where: { id: candidate.partyId } });
    const consent = await tx.privacyConsent.findUniqueOrThrow({
      where: { id: candidate.consentId },
    });
    const kept = await tx.hrCandidate.findUniqueOrThrow({ where: { id: retains } });
    const events = await tx.auditEvent.count({
      where: { entityId: expires, action: 'hr.candidate.erase' },
    });
    return { candidate, person, consent, kept, events };
  });
  expect(rows.candidate.erasedAt).toBeInstanceOf(Date);
  expect(rows.person).toMatchObject({
    firstName: 'Candidato',
    lastName: 'Anonimizado',
    idNumber: null,
    email: null,
  });
  expect(rows.consent).toMatchObject({ ipAddress: null, userAgent: null });
  expect(rows.kept.erasedAt).toBeNull();
  expect(rows.events).toBe(1);
}

it('anonimiza una candidatura vencida y conserva la autorización vigente del banco de talento', async () => {
  const recruiter = await scenario.person('seleccion', ['TALENTO_HUMANO']);
  const expires = await discardCandidate(recruiter, false);
  const retains = await discardCandidate(recruiter, true);
  await runRetention(expires);
  await erasedData(expires, retains);
});

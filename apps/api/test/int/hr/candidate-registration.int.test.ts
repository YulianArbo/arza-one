import { hrCreatedResponseSchema } from '@arza/contracts';
import { expect, it } from 'vitest';

import { AccessScenario, type Person } from '../iam/support/access-scenario.js';
import { contactNoticeId } from '../party/support/party-scenario.js';
import { registrationBody, type RegistrationBody } from './support/candidate-fixture.js';

const scenario = new AccessScenario('registro de candidato');

interface RegisteredCandidate {
  readonly recruiter: Person;
  readonly body: RegistrationBody;
  readonly candidateId: string;
}

/** Registro idempotente solo con el aviso de selección: el de contactos se rechaza. */
async function registeredCandidate(): Promise<RegisteredCandidate> {
  const recruiter = await scenario.person('seleccion', ['TALENTO_HUMANO']);
  const body = await registrationBody(scenario);
  const key = crypto.randomUUID();
  const post = (input: object) =>
    scenario.post('/v1/hr/candidates', recruiter.session, input).set('Idempotency-Key', key);
  const wrongNotice = await contactNoticeId(scenario);
  const rejected = await post({ ...body, consent: { ...body.consent, notice_id: wrongNotice } });
  expect(rejected.status, rejected.text).toBe(422);
  const created = await post(body);
  expect(created.status, created.text).toBe(201);
  const result = hrCreatedResponseSchema.parse(created.body);
  expect((await post(body)).body).toEqual(result);
  return { recruiter, body, candidateId: result.id };
}

/** La persona y su autorización quedan ligadas; la auditoría no guarda datos personales. */
async function recordedConsent(context: RegisteredCandidate): Promise<void> {
  const records = await scenario.inTenant(async (tx) => {
    const candidate = await tx.hrCandidate.findUniqueOrThrow({
      where: { id: context.candidateId },
    });
    const consent = await tx.privacyConsent.findUniqueOrThrow({
      where: { id: candidate.consentId },
    });
    const events = await tx.auditEvent.findMany({
      where: { entityId: { in: [candidate.partyId, candidate.id] } },
    });
    return { consent, candidate, events };
  });
  expect(records.consent).toMatchObject({
    source: 'hr_candidate',
    partyId: records.candidate.partyId,
  });
  expect(records.events.map(({ action }) => action)).toEqual(
    expect.arrayContaining(['party.create', 'hr.candidate.create']),
  );
  expect(JSON.stringify(records.events.map(({ changes }) => changes))).not.toContain(
    context.body.person.email,
  );
}

/** Avance hasta evaluación con nota y lista filtrada por la vacante. */
async function advancedAndEvaluated(context: RegisteredCandidate): Promise<void> {
  const base = `/v1/hr/candidates/${context.candidateId}`;
  const advance = (version: string) =>
    scenario.post(`${base}/actions/advance`, context.recruiter.session).set('If-Match', version);
  expect((await advance('"1"')).status).toBe(204);
  expect((await advance('"2"')).status).toBe(204);
  const evaluation = await scenario
    .post(`${base}/evaluations`, context.recruiter.session, {
      kind: 'interview',
      evaluated_on: context.body.applied_on,
      score: 87,
    })
    .set('Idempotency-Key', crypto.randomUUID());
  expect(evaluation.status, evaluation.text).toBe(201);
  const list = await scenario.get(
    `/v1/hr/candidates?vacancy_id=${context.body.vacancy_id}`,
    context.recruiter.session,
  );
  expect(list.status, list.text).toBe(200);
  expect(list.body).toMatchObject({
    data: [
      {
        id: context.candidateId,
        stage: 'evaluating',
        evaluations: [{ kind: 'interview', score: 87 }],
      },
    ],
  });
}

it('registra a la persona y su autorización únicamente con el aviso de selección', async () => {
  const context = await registeredCandidate();
  await recordedConsent(context);
  await advancedAndEvaluated(context);
});

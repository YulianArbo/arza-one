import { hrCreatedResponseSchema } from '@arza/contracts';
import type request from 'supertest';
import { v7 as uuidv7 } from 'uuid';

import { bogotaToday } from '../../../../src/modules/core/index.js';
import { putVersioned } from '../../fin/support/ledger-steps.js';
import { candidateFixture, registrationBody } from '../../hr/support/candidate-fixture.js';
import { hiringFixture } from '../../hr/support/hiring-fixture.js';
import type { AccessScenario, Person } from '../../iam/support/access-scenario.js';

/** La petición va dentro de un objeto: una función async que la devolviera sola la enviaría. */
interface PendingRequest {
  readonly test: request.Test;
}

type RouteCall = (scenario: AccessScenario) => Promise<PendingRequest>;

function final(test: request.Test): PendingRequest {
  return { test };
}

async function vacancyCall(scenario: AccessScenario, recruiter: Person) {
  const tenantId = scenario.tenant.id;
  const position = await scenario.inTenant(async (tx) => {
    const unit = await tx.orgUnit.create({
      data: {
        tenantId,
        code: `HR${uuidv7().slice(-8).toUpperCase()}`,
        name: 'Selección',
        kind: 'area',
      },
    });
    return tx.position.create({ data: { tenantId, orgUnitId: unit.id, name: 'Analista' } });
  });
  return final(
    scenario
      .post('/v1/hr/vacancies', recruiter.session, {
        position_id: position.id,
        opened_on: bogotaToday(scenario.clock.now()),
        reason: 'new_position',
      })
      .set('Idempotency-Key', uuidv7()),
  );
}

async function activationCall(scenario: AccessScenario) {
  const { prepare, recruiter, body } = await hiringFixture(scenario);
  const { id } = hrCreatedResponseSchema.parse((await prepare()).body);
  await scenario.inTenant(async (tx) => {
    const contract = await tx.hrContract.findFirstOrThrow({ where: { employeeId: id } });
    if (contract.envelopeId === null) throw new Error('Falta el proceso de firma');
    const now = scenario.clock.now();
    const code = uuidv7().replaceAll('-', '').slice(-12).toUpperCase();
    await tx.sigEnvelope.update({
      where: { id: contract.envelopeId },
      data: {
        status: 'completed',
        completedAt: now,
        closedAt: now,
        sealStatus: 'ready',
        signedFileId: body.contract_file_id,
        evidenceFileId: body.contract_file_id,
        signedSha256: 'a'.repeat(64),
        verificationCode: `${code.slice(0, 4)}-${code.slice(4, 8)}-${code.slice(8)}`,
      },
    });
  });
  return {
    id,
    recruiter,
    test: scenario
      .post(`/v1/hr/employees/${id}/actions/activate`, recruiter.session)
      .set('If-Match', '"1"'),
  };
}

export const HR_ROUTE_CALLS: Readonly<Record<string, RouteCall>> = {
  'PUT /v1/hr/employees/{id}/file/{item}': async (scenario) => {
    const { id, recruiter, test } = await activationCall(scenario);
    if ((await test).status !== 204) throw new Error('No se pudo vincular a la persona de prueba');
    return final(
      putVersioned(
        scenario,
        `/v1/hr/employees/${id}/file/education`,
        recruiter,
        { status: 'received' },
        1,
      ),
    );
  },
  'POST /v1/hr/employees/{id}/onboarding/{taskId}/actions/complete': async (scenario) => {
    const { id, recruiter, test } = await activationCall(scenario);
    if ((await test).status !== 204) throw new Error('No se pudo vincular a la persona de prueba');
    const task = await scenario.inTenant((tx) =>
      tx.hrOnboardingTask.findFirstOrThrow({ where: { employeeId: id, kind: 'induction' } }),
    );
    return final(
      scenario
        .post(`/v1/hr/employees/${id}/onboarding/${task.id}/actions/complete`, recruiter.session, {
          done_on: bogotaToday(scenario.clock.now()),
        })
        .set('If-Match', '"1"'),
    );
  },
  'POST /v1/hr/employees/{id}/actions/cancel-hiring': async (scenario) => {
    const { prepare, recruiter } = await hiringFixture(scenario);
    const { id } = hrCreatedResponseSchema.parse((await prepare()).body);
    return final(
      scenario
        .post(`/v1/hr/employees/${id}/actions/cancel-hiring`, recruiter.session, {
          reason: 'Proceso anulado',
        })
        .set('If-Match', '"1"'),
    );
  },
  'POST /v1/hr/employees/{id}/contract/download-link': async (scenario) => {
    const { prepare, recruiter } = await hiringFixture(scenario);
    const { id } = hrCreatedResponseSchema.parse((await prepare()).body);
    return final(scenario.post(`/v1/hr/employees/${id}/contract/download-link`, recruiter.session));
  },
  'POST /v1/hr/employees/{id}/actions/activate': async (scenario) =>
    final((await activationCall(scenario)).test),
  'POST /v1/hr/candidates/{id}/actions/prepare-hiring': async (scenario) => {
    const { prepare } = await hiringFixture(scenario);
    return final(prepare());
  },
  'POST /v1/hr/employees/{id}/contract/actions/sign': async (scenario) => {
    const { prepare, director } = await hiringFixture(scenario);
    const { id } = hrCreatedResponseSchema.parse((await prepare()).body);
    await scenario.inTenant(async (tx) => {
      const contract = await tx.hrContract.findFirstOrThrow({ where: { employeeId: id } });
      if (contract.envelopeId === null) throw new Error('Falta el proceso de firma');
      await tx.sigSigner.updateMany({
        where: { envelopeId: contract.envelopeId, kind: 'client' },
        data: {
          status: 'signed',
          signedAt: scenario.clock.now(),
          method: 'email_code',
          acceptanceText: 'Aceptación ficticia para la prueba de auditoría.',
        },
      });
      await tx.sigSigner.updateMany({
        where: { envelopeId: contract.envelopeId, kind: 'company' },
        data: { status: 'pending' },
      });
    });
    return final(
      scenario.post(`/v1/hr/employees/${id}/contract/actions/sign`, director.session, {
        accept: true,
      }),
    );
  },
  'POST /v1/hr/candidates/{id}/evaluations': async (scenario) => {
    const recruiter = await scenario.person('evaluacion-candidato', ['TALENTO_HUMANO']);
    const { id } = await candidateFixture(scenario);
    await scenario.inTenant((tx) =>
      tx.hrCandidate.update({ where: { id }, data: { stage: 'evaluating' } }),
    );
    return final(
      scenario
        .post(`/v1/hr/candidates/${id}/evaluations`, recruiter.session, {
          kind: 'interview',
          evaluated_on: bogotaToday(scenario.clock.now()),
          score: 87,
        })
        .set('Idempotency-Key', uuidv7()),
    );
  },
  'POST /v1/hr/candidates': async (scenario) => {
    const recruiter = await scenario.person('registro-candidato', ['TALENTO_HUMANO']);
    return final(
      scenario
        .post('/v1/hr/candidates', recruiter.session, await registrationBody(scenario))
        .set('Idempotency-Key', uuidv7()),
    );
  },
  'POST /v1/hr/candidates/{id}/actions/advance': async (scenario) => {
    const recruiter = await scenario.person('avance-candidato', ['TALENTO_HUMANO']);
    const { id } = await candidateFixture(scenario);
    return final(
      scenario
        .post(`/v1/hr/candidates/${id}/actions/advance`, recruiter.session)
        .set('If-Match', '"1"'),
    );
  },
  'POST /v1/hr/candidates/{id}/actions/discard': async (scenario) => {
    const recruiter = await scenario.person('descarte-candidato', ['TALENTO_HUMANO']);
    const { id } = await candidateFixture(scenario);
    return final(
      scenario
        .post(`/v1/hr/candidates/${id}/actions/discard`, recruiter.session, {
          reason: 'Proceso finalizado',
        })
        .set('If-Match', '"1"'),
    );
  },
  'POST /v1/hr/vacancies': async (scenario) =>
    vacancyCall(scenario, await scenario.person('vacantes-auditoria', ['TALENTO_HUMANO'])),
  'POST /v1/hr/vacancies/{id}/actions/close': async (scenario) => {
    const recruiter = await scenario.person('cierre-vacantes-auditoria', ['TALENTO_HUMANO']);
    const response = await (await vacancyCall(scenario, recruiter)).test;
    const { id } = hrCreatedResponseSchema.parse(response.body);
    return final(
      scenario
        .post(`/v1/hr/vacancies/${id}/actions/close`, recruiter.session, {
          outcome: 'closed',
          closed_on: bogotaToday(scenario.clock.now()),
          note: 'Proceso finalizado',
        })
        .set('If-Match', '"1"'),
    );
  },
};

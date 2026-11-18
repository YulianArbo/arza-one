import { candidateListResponseSchema, hrCreatedResponseSchema } from '@arza/contracts';
import type request from 'supertest';
import { v7 as uuidv7 } from 'uuid';
import { expect, it } from 'vitest';

import { bogotaToday, fromCalendarDate } from '../../../src/modules/core/index.js';
import { AccessScenario, type Person } from '../iam/support/access-scenario.js';
import { candidateFixture, registrationBody } from './support/candidate-fixture.js';

// Casos límite de la selección (B35): registros inexistentes, versiones viejas, estados que no
// admiten el paso y reintentos con otros datos en vacantes, candidaturas y evaluaciones.

const scenario = new AccessScenario('casos límite de talento humano');
const DAY = 24 * 60 * 60 * 1000;
const MISSING = '01900000-0000-7000-8000-00000000dead';

function today(): string {
  return bogotaToday(scenario.clock.now());
}

function evaluate(person: Person, candidateId: string, body: object, key = uuidv7()): request.Test {
  return scenario
    .post(`/v1/hr/candidates/${candidateId}/evaluations`, person.session, body)
    .set('Idempotency-Key', key);
}

function register(person: Person, body: object, key = uuidv7()): request.Test {
  return scenario.post('/v1/hr/candidates', person.session, body).set('Idempotency-Key', key);
}

/** Otra persona para la misma vacante. */
async function registrationBodyFor(vacancyId: string) {
  return { ...(await registrationBody(scenario)), vacancy_id: vacancyId };
}

it('rechaza evaluaciones fuera de etapa, de fecha o repetidas con otros datos', async () => {
  const recruiter = await scenario.person('evaluaciones', ['TALENTO_HUMANO']);
  const { id } = await candidateFixture(scenario);
  const body = { kind: 'interview', evaluated_on: today(), score: 70 };
  expect((await evaluate(recruiter, MISSING, body)).status).toBe(404);
  expect((await evaluate(recruiter, id, body)).status).toBe(409);
  await scenario.inTenant((tx) =>
    tx.hrCandidate.update({ where: { id }, data: { stage: 'evaluating' } }),
  );
  const early = { ...body, evaluated_on: '2000-01-01' };
  expect((await evaluate(recruiter, id, early)).status).toBe(422);
  const key = uuidv7();
  const first = await evaluate(recruiter, id, body, key);
  expect(first.status, first.text).toBe(201);
  const again = await evaluate(recruiter, id, body, key);
  expect(again.body).toEqual(first.body);
  expect((await evaluate(recruiter, id, { ...body, score: 71 }, key)).status).toBe(409);
});

it('lista por vacante y oculta los datos de una candidatura eliminada', async () => {
  const recruiter = await scenario.person('listado', ['TALENTO_HUMANO']);
  const kept = await candidateFixture(scenario);
  const erased = await candidateFixture(scenario);
  const at = scenario.clock.now();
  await scenario.inTenant((tx) =>
    tx.hrCandidate.update({
      where: { id: erased.id },
      data: {
        stage: 'discarded',
        discardedOn: fromCalendarDate(today()),
        discardReason: 'Proceso finalizado',
        retentionUntil: new Date(at.getTime() + DAY),
        erasedAt: at,
      },
    }),
  );
  const filtered = await scenario.get(
    `/v1/hr/candidates?vacancy_id=${kept.vacancyId}`,
    recruiter.session,
  );
  expect(filtered.status, filtered.text).toBe(200);
  const rows = candidateListResponseSchema.parse(filtered.body).data;
  expect(rows.map((row) => row.id)).toEqual([kept.id]);
  expect(rows[0]).toMatchObject({ name: 'Datos no disponibles', email: null });
  const all = candidateListResponseSchema.parse(
    (await scenario.get('/v1/hr/candidates', recruiter.session)).body,
  ).data;
  expect(all.find((row) => row.id === erased.id)).toMatchObject({
    name: 'Datos no disponibles',
    discard_reason: null,
    resume_file_id: null,
    evaluations: [],
  });
});

it('no prepara contrato de una candidatura inexistente o sin seleccionar', async () => {
  const recruiter = await scenario.person('contrato-limites', ['TALENTO_HUMANO']);
  const { id } = await candidateFixture(scenario);
  const prepare = (candidateId: string) =>
    scenario
      .post(`/v1/hr/candidates/${candidateId}/actions/prepare-hiring`, recruiter.session, {
        position_id: uuidv7(),
        hire_date: today(),
        contract_type: 'indefinite',
        work_mode: 'on_site',
        salary_band: 'BANDA_1',
        salary: '2500000',
        work_email: 'nueva@arza.test',
        contract_file_id: uuidv7(),
        company_signer_id: uuidv7(),
      })
      .set('If-Match', '"1"')
      .set('Idempotency-Key', uuidv7());
  expect((await prepare(MISSING)).status).toBe(404);
  expect((await prepare(id)).status).toBe(409);
});

it('rechaza vacantes con cargo inexistente y cierres repetidos o fuera de fecha', async () => {
  const recruiter = await scenario.person('vacantes-limites', ['TALENTO_HUMANO']);
  const create = (body: object) =>
    scenario.post('/v1/hr/vacancies', recruiter.session, body).set('Idempotency-Key', uuidv7());
  const invalid = await create({
    position_id: uuidv7(),
    reason: 'replacement',
    opened_on: today(),
  });
  expect(invalid.status).toBe(422);
  const { vacancyId } = await candidateFixture(scenario);
  const close = (id: string, body: object, version: number) =>
    scenario
      .post(`/v1/hr/vacancies/${id}/actions/close`, recruiter.session, body)
      .set('If-Match', `"${String(version)}"`);
  const closing = { outcome: 'cancelled', closed_on: today(), note: 'Sin presupuesto' };
  expect((await close(MISSING, closing, 1)).status).toBe(404);
  expect((await close(vacancyId, closing, 4)).status).toBe(409);
  expect((await close(vacancyId, { ...closing, closed_on: '2000-01-01' }, 1)).status).toBe(422);
  expect((await close(vacancyId, closing, 1)).status).toBe(204);
  expect((await close(vacancyId, closing, 2)).status).toBe(409);
});

it('rechaza candidaturas a vacantes cerradas, fuera de fecha, con soporte ajeno o repetidas', async () => {
  const recruiter = await scenario.person('registro-limites', ['TALENTO_HUMANO']);
  const body = await registrationBody(scenario);
  const early = { ...body, applied_on: '2000-01-01' };
  expect((await register(recruiter, early)).status).toBe(422);
  const foreign = { ...body, resume_file_id: uuidv7() };
  expect((await register(recruiter, foreign)).status).toBe(422);
  const key = uuidv7();
  expect((await register(recruiter, body, key)).status).toBe(201);
  expect((await register(recruiter, { ...body, source: 'website' }, key)).status).toBe(409);
  await scenario.inTenant((tx) =>
    tx.hrVacancy.update({
      where: { id: body.vacancy_id },
      data: {
        status: 'closed',
        closedOn: fromCalendarDate(today()),
        closeNote: 'Cubierta',
        closedBy: recruiter.id,
      },
    }),
  );
  expect((await register(recruiter, await registrationBodyFor(body.vacancy_id))).status).toBe(422);
});

it('no avanza más allá de seleccionado, no descarta con vinculación pendiente ni aplaza lo abierto', async () => {
  const recruiter = await scenario.person('etapas-limites', ['TALENTO_HUMANO']);
  const { id } = await candidateFixture(scenario);
  const { version } = await scenario.inTenant((tx) =>
    tx.hrCandidate.update({ where: { id }, data: { stage: 'selected' } }),
  );
  const action = (candidateId: string, name: string, body: object, v: number) =>
    scenario
      .post(`/v1/hr/candidates/${candidateId}/actions/${name}`, recruiter.session, body)
      .set('If-Match', `"${String(v)}"`);
  expect((await action(id, 'advance', {}, version)).status).toBe(409);
  expect((await action(id, 'extend-retention', {}, version)).status).toBe(409);
  expect((await action(MISSING, 'extend-retention', {}, 1)).status).toBe(404);
  await scenario.inTenant((tx) =>
    tx.hrEmployee.create({
      data: {
        tenantId: scenario.tenant.id,
        partyId: uuidv7(),
        candidateId: id,
        positionId: uuidv7(),
        hireDate: fromCalendarDate(today()),
        contractType: 'indefinite',
        workMode: 'on_site',
        workEmail: `${uuidv7()}@arza.test`,
        requestKey: uuidv7(),
      },
    }),
  );
  const discard = await action(id, 'discard', { reason: 'Otro perfil' }, version);
  expect(discard.status).toBe(409);
});

it('reutiliza la persona que ya está en Terceros cuando se postula de nuevo', async () => {
  const recruiter = await scenario.person('repostulacion', ['TALENTO_HUMANO']);
  const first = await registrationBody(scenario);
  const second = { ...(await registrationBody(scenario)), person: first.person };
  const created = await register(recruiter, first);
  expect(created.status, created.text).toBe(201);
  const again = await register(recruiter, second);
  expect(again.status, again.text).toBe(201);
  const rows = await scenario.inTenant((tx) =>
    tx.hrCandidate.findMany({
      where: {
        id: {
          in: [created.body, again.body].map((body) => hrCreatedResponseSchema.parse(body).id),
        },
      },
    }),
  );
  expect(new Set(rows.map((row) => row.partyId)).size).toBe(1);
  expect(new Set(rows.map((row) => row.consentId)).size).toBe(2);
  const partyId = rows[0]?.partyId ?? '';
  await scenario.inTenant((tx) =>
    tx.partyRole.updateMany({
      where: { partyId, role: 'candidate' },
      data: { status: 'ended', deletedAt: scenario.clock.now() },
    }),
  );
  const third = { ...(await registrationBody(scenario)), person: first.person };
  expect((await register(recruiter, third)).status).toBe(201);
  const role = await scenario.inTenant((tx) =>
    tx.partyRole.findFirstOrThrow({ where: { partyId, role: 'candidate' } }),
  );
  expect(role).toMatchObject({ status: 'active', deletedAt: null });
});

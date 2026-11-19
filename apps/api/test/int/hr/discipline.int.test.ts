import {
  disciplinaryCaseSchema,
  hrCreatedResponseSchema,
  ownDisciplinaryListResponseSchema,
} from '@arza/contracts';
import { v7 as uuidv7 } from 'uuid';
import { expect, it } from 'vitest';

import { addDays, bogotaToday } from '../../../src/modules/core/index.js';
import { AccessScenario, type Person } from '../iam/support/access-scenario.js';
import { availableFile, staffFixture, weekdayAfter, type Staff } from './support/people-fixture.js';

// Proceso disciplinario con debido proceso (B36, decisión 8): pasos en orden, plazo mínimo entre
// la citación y los descargos, textos cifrados en la base, cada lectura auditada, solo Talento
// humano lo gestiona y el colaborador ve su caso desde la citación.

const scenario = new AccessScenario('proceso disciplinario');
const FACTS = 'Llegó tarde cinco veces en el mes sin justificación, según el control de acceso.';

function step(person: Person, id: string, action: string, version: number, body: object) {
  return scenario
    .post(`/v1/hr/disciplinary-cases/${id}/actions/${action}`, person.session, body)
    .set('If-Match', `"${String(version)}"`);
}

it('sigue citación, descargos y decisión en orden, con los textos cifrados', async () => {
  const staff = await staffFixture(scenario, 'disciplina');
  const body = { employee_id: staff.workerEmployeeId, facts: FACTS };
  const denied = await scenario
    .post('/v1/hr/disciplinary-cases', staff.boss.session, body)
    .set('Idempotency-Key', uuidv7());
  expect(denied.status).toBe(403);
  const opened = await scenario
    .post('/v1/hr/disciplinary-cases', staff.hr.session, body)
    .set('Idempotency-Key', uuidv7());
  expect(opened.status, opened.text).toBe(201);
  const { id } = hrCreatedResponseSchema.parse(opened.body);
  const stored = await scenario.inTenant((tx) =>
    tx.hrDisciplinaryCase.findFirstOrThrow({ where: { id } }),
  );
  expect(stored.factsEncrypted).not.toContain('tarde');
  expect(stored.code).toMatch(/^DIS-\d{4}-\d{4}$/u);
  const hearing = {
    statement: 'Reconoce los retrasos por transporte.',
    hearing_record_file_id: uuidv7(),
  };
  expect((await step(staff.hr, id, 'hearing', 1, hearing)).status).toBe(409);
  const tomorrow = addDays(bogotaToday(scenario.clock.now()), 1);
  expect((await step(staff.hr, id, 'cite', 1, { hearing_on: tomorrow })).status).toBe(422);
  const hearingOn = weekdayAfter(scenario, 10);
  expect((await step(staff.hr, id, 'cite', 1, { hearing_on: hearingOn })).status).toBe(204);
  const own = ownDisciplinaryListResponseSchema.parse(
    (await scenario.post('/v1/hr/me/disciplinary-cases/read', staff.worker.session)).body,
  );
  expect(own.data[0]).toMatchObject({ id, status: 'cited', facts: FACTS, hearing_on: hearingOn });
  expect(own.data[0]).not.toHaveProperty('statement');
  expect((await step(staff.hr, id, 'hearing', 2, hearing)).status).toBe(422);
  const notice = await scenario.inTenant((tx) =>
    tx.outboxEvent.findFirst({ where: { eventType: 'hr.disciplinary.cited' } }),
  );
  expect(JSON.stringify(notice?.payload)).not.toContain('tarde');
});

/** Un caso abierto y citado con la diligencia ayer, listo para los descargos. */
async function citedYesterday(staff: Staff): Promise<string> {
  const opened = await scenario
    .post('/v1/hr/disciplinary-cases', staff.hr.session, {
      employee_id: staff.workerEmployeeId,
      facts: FACTS,
    })
    .set('Idempotency-Key', uuidv7());
  const { id } = hrCreatedResponseSchema.parse(opened.body);
  const past = addDays(bogotaToday(scenario.clock.now()), -1);
  await scenario.inTenant((tx) =>
    tx.hrDisciplinaryCase.update({
      where: { id },
      data: {
        status: 'cited',
        citedOn: new Date(`${addDays(past, -6)}T00:00:00Z`),
        hearingOn: new Date(`${past}T00:00:00Z`),
        openedOn: new Date(`${addDays(past, -7)}T00:00:00Z`),
      },
    }),
  );
  return id;
}

const STATEMENT = 'Reconoce los retrasos por transporte.';
const REASONING = 'Se comprobaron los retrasos y se tienen en cuenta los descargos.';

it('exige el acta disponible y los descargos antes de decidir', async () => {
  const staff = await staffFixture(scenario, 'disciplina-orden');
  const id = await citedYesterday(staff);
  const hearing = { statement: STATEMENT, hearing_record_file_id: uuidv7() };
  expect((await step(staff.hr, id, 'hearing', 2, hearing)).status).toBe(422);
  const decision = { decision: 'warning', reasoning: REASONING };
  expect((await step(staff.hr, id, 'decide', 2, decision)).status).toBe(409);
});

it('registra descargos y decisión motivada; cada lectura queda auditada', async () => {
  const staff = await staffFixture(scenario, 'disciplina-decision');
  const id = await citedYesterday(staff);
  const record = await availableFile(scenario, staff.hr);
  const heard = await step(staff.hr, id, 'hearing', 2, {
    statement: STATEMENT,
    hearing_record_file_id: record,
  });
  expect(heard.status, heard.text).toBe(204);
  const suspension = { decision: 'suspension', suspension_days: 2, reasoning: REASONING };
  expect((await step(staff.hr, id, 'decide', 3, suspension)).status).toBe(204);
  const read = await scenario.post(`/v1/hr/disciplinary-cases/${id}/read`, staff.hr.session);
  expect(disciplinaryCaseSchema.parse(read.body)).toMatchObject({
    facts: FACTS,
    status: 'decided',
    statement: STATEMENT,
    decision: 'suspension',
    suspension_days: 2,
    reasoning: REASONING,
  });
  const own = ownDisciplinaryListResponseSchema.parse(
    (await scenario.post('/v1/hr/me/disciplinary-cases/read', staff.worker.session)).body,
  );
  expect(own.data[0]).toMatchObject({ decision: 'suspension', reasoning: REASONING });
  const boss = await scenario.post(`/v1/hr/disciplinary-cases/${id}/read`, staff.boss.session);
  expect(boss.status).toBe(403);
  const reads = await scenario.inTenant((tx) =>
    tx.auditEvent.count({ where: { entityId: id, action: 'hr.disciplinary.read' } }),
  );
  expect(reads).toBe(1);
});

it('otra empresa no ve los procesos', async () => {
  const staff = await staffFixture(scenario, 'disciplina-aislada');
  await scenario
    .post('/v1/hr/disciplinary-cases', staff.hr.session, {
      employee_id: staff.workerEmployeeId,
      facts: FACTS,
    })
    .set('Idempotency-Key', uuidv7());
  const stranger = await scenario.person('disciplina-ajena', ['TALENTO_HUMANO'], {
    tenantId: scenario.otherTenant.id,
  });
  expect((await scenario.get('/v1/hr/disciplinary-cases', stranger.session)).body).toEqual({
    data: [],
  });
});

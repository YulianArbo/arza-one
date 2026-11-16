import { hrCreatedResponseSchema } from '@arza/contracts';
import type request from 'supertest';
import { describe, expect, it } from 'vitest';

import { bogotaToday } from '../../../src/modules/core/index.js';
import { AccessScenario, type Person } from '../iam/support/access-scenario.js';

const scenario = new AccessScenario('vacantes');
const path = '/v1/hr/vacancies';

/** Talento Humano consulta; un colaborador sin permiso recibe 403. */
async function consultationPermissions(): Promise<void> {
  const recruiter = await scenario.person('seleccion', ['TALENTO_HUMANO']);
  const contributor = await scenario.person('colaborador', ['COLABORADOR']);
  const allowed = await scenario.get(path, recruiter.session);
  expect(allowed.status, allowed.text).toBe(200);
  expect(allowed.body).toEqual({ data: [] });
  expect((await scenario.get(path, contributor.session)).status).toBe(403);
}

interface VacancyContext {
  readonly recruiter: Person;
  readonly other: Person;
  readonly vacancy: { readonly id: string };
  readonly body: {
    readonly position_id: string;
    readonly opened_on: string;
    readonly reason: string;
  };
  readonly create: (input: object) => request.Test;
}

/** Alta idempotente de la vacante con el cargo recién creado en la empresa. */
async function openVacancy(): Promise<VacancyContext> {
  const recruiter = await scenario.person('seleccion', ['TALENTO_HUMANO']);
  const other = await scenario.person('otra', ['TALENTO_HUMANO'], {
    tenantId: scenario.otherTenant.id,
  });
  const tenantId = scenario.tenant.id;
  const position = await scenario.inTenant(async (tx) => {
    const unit = await tx.orgUnit.create({
      data: { tenantId, code: 'HR', name: 'Talento Humano', kind: 'area' },
    });
    return tx.position.create({ data: { tenantId, orgUnitId: unit.id, name: 'Analista' } });
  });
  const key = crypto.randomUUID();
  const body = {
    position_id: position.id,
    opened_on: bogotaToday(scenario.clock.now()),
    reason: 'new_position',
  };
  const create = (input: object) =>
    scenario.post(path, recruiter.session, input).set('Idempotency-Key', key);
  const created = await create(body);
  expect(created.status, created.text).toBe(201);
  return { recruiter, other, vacancy: hrCreatedResponseSchema.parse(created.body), body, create };
}

/** Repetición idempotente, conflicto por clave reutilizada, aislamiento y una sola auditoría. */
async function registrations(context: VacancyContext): Promise<void> {
  expect((await context.create(context.body)).body).toEqual(context.vacancy);
  expect((await context.create({ ...context.body, reason: 'replacement' })).status).toBe(409);
  expect((await scenario.get(path, context.recruiter.session)).body).toMatchObject({
    data: [{ id: context.vacancy.id, position: { name: 'Analista' }, status: 'open' }],
  });
  expect((await scenario.get(path, context.other.session)).body).toEqual({ data: [] });
  const audit = await scenario.inTenant((tx) =>
    tx.auditEvent.count({ where: { action: 'hr.vacancy.create', entityType: 'hr_vacancy' } }),
  );
  expect(audit).toBe(1);
}

/** Cierre: otra empresa no la ve, la versión vieja falla y la nueva deja el estado final. */
async function closedVacancy(context: VacancyContext): Promise<void> {
  const close = (session: Person['session']) =>
    scenario
      .post(`${path}/${context.vacancy.id}/actions/close`, session, {
        outcome: 'closed',
        closed_on: context.body.opened_on,
        note: 'Proceso finalizado',
      })
      .set('If-Match', '"1"');
  expect((await close(context.other.session)).status).toBe(404);
  expect((await close(context.recruiter.session)).status).toBe(204);
  expect((await close(context.recruiter.session)).status).toBe(409);
  expect((await scenario.get(path, context.recruiter.session)).body).toMatchObject({
    data: [
      {
        id: context.vacancy.id,
        status: 'closed',
        closed_on: context.body.opened_on,
        version: 2,
      },
    ],
  });
}

describe('consulta de vacantes', () => {
  it('permite consultar a Talento Humano y deniega a un colaborador', consultationPermissions);

  it('registra una vacante una sola vez, audita el alta y la aísla por empresa', async () => {
    const context = await openVacancy();
    await registrations(context);
    await closedVacancy(context);
  });
});

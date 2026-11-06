import { timeOptionsSchema, type TimeEntry } from '@arza/contracts';
import { describe, expect, it } from 'vitest';

import type { Person } from '../iam/support/access-scenario.js';
import { errorCode } from '../iam/support/iam-fixtures.js';
import { DeliveryScenario } from './support/delivery-scenario.js';

// Registro de horas (B27, ficha 17.8): cada miembro registra las suyas con máximo siete días de
// atraso y sin pasar de 24 horas en un día; el Líder técnico aprueba o devuelve, nunca las propias;
// una aprobada no cambia; quien no es del equipo no registra.

const scenario = new DeliveryScenario('horas de proyectos');

/** Proyecto en ejecución con una persona del equipo, además del líder. */
async function teamProject(): Promise<{ leader: Person; developer: Person; id: string }> {
  const leader = await scenario.leader();
  const developer = await scenario.developer();
  const id = await scenario.runningProject(leader);
  await scenario.addMember(leader, id, developer);
  return { leader, developer, id };
}

describe('registrar horas', () => {
  it('rechaza el octavo día de atraso, el futuro, lo que no es cuarto de hora y más de 24 h', async () => {
    const { developer, id } = await teamProject();
    expect((await scenario.logTime(developer, id, { hours: 3.5 })).status).toBe(201);
    const late = await scenario.logTime(developer, id, { work_date: scenario.day(-8) });
    expect(errorCode(late)).toBe('PROJECT_TIME_INVALID');
    const lastDay = await scenario.logTime(developer, id, { work_date: scenario.day(-7) });
    expect(lastDay.status).toBe(201);
    const future = await scenario.logTime(developer, id, { work_date: scenario.day(1) });
    expect(errorCode(future)).toBe('PROJECT_TIME_INVALID');
    expect((await scenario.logTime(developer, id, { hours: 1.1 })).status).toBe(422);
    const tooMuch = await scenario.logTime(developer, id, { hours: 21 });
    expect(errorCode(tooMuch)).toBe('PROJECT_TIME_INVALID');
    expect((await scenario.times(developer, id)).total_hours).toBe(7.5);
  });

  it('el miembro corrige las suyas', async () => {
    const { leader, developer, id } = await teamProject();
    const item = await scenario.item(leader, id);
    await scenario.logTime(developer, id, { item_id: item, hours: 3.5 });
    const [entry] = (await scenario.times(developer, id)).data;
    if (entry === undefined) throw new Error('No aparece la hora registrada');
    const fixed = await scenario.put(
      `/v1/projects/${id}/time-entries/${entry.id}`,
      developer,
      { work_date: scenario.day(0), hours: 4, item_id: item, billable: false, note: null },
      entry.version,
    );
    expect(fixed.status, fixed.text).toBe(204);
    expect((await scenario.times(developer, id)).total_hours).toBe(4);
  });
});

describe('quién registra y quién ve', () => {
  it('quien no es del equipo no registra y el equipo ve solo sus horas', async () => {
    const { leader, developer: member, id } = await teamProject();
    const outsider = await scenario.person('ajeno', ['EQUIPO_PROYECTO']);
    expect((await scenario.logTime(outsider, id)).status).toBe(404);
    // El líder del proyecto también está en el equipo y registra las suyas.
    expect((await scenario.logTime(leader, id)).status).toBe(201);
    expect((await scenario.logTime(member, id)).status).toBe(201);
    const seen = (await scenario.times(member, id)).data.map((row) => row.person.id);
    expect(seen).toEqual([member.id]);
    expect((await scenario.times(leader, id)).data).toHaveLength(2);

    const options = await scenario.get('/v1/time-entries/options', member.session);
    expect(options.status, options.text).toBe(200);
    const parsed = timeOptionsSchema.parse(options.body);
    expect(parsed.projects.map((project) => project.id)).toContain(id);
    expect(parsed.earliest_date).toBe(scenario.day(-7));
    expect((await scenario.get('/v1/time-entries/mine', member.session)).status).toBe(200);
  });
});

interface Logged {
  readonly own: TimeEntry;
  readonly first: TimeEntry;
  readonly second: TimeEntry;
}

/** Horas del desarrollador (4 y 2) y del líder (4). */
async function logged(leader: Person, developer: Person, id: string): Promise<Logged> {
  await scenario.logTime(developer, id);
  await scenario.logTime(developer, id, { hours: 2 });
  await scenario.logTime(leader, id);
  const all = (await scenario.times(leader, id)).data;
  const own = all.find((row) => row.person.id === leader.id);
  const theirs = all.filter((row) => row.person.id === developer.id);
  const first = theirs.find((row) => row.hours === 4);
  const second = theirs.find((row) => row.hours === 2);
  if (own === undefined || first === undefined || second === undefined) {
    throw new Error('Faltan horas');
  }
  return { own, first, second };
}

describe('aprobar horas', () => {
  it('el Líder técnico aprueba; nunca las propias; la aprobada no cambia', async () => {
    const { leader, developer, id } = await teamProject();
    const { own, first } = await logged(leader, developer, id);
    const approvePath = `/v1/projects/${id}/time-entries/actions/approve`;
    const self = await scenario.post(approvePath, leader.session, { ids: [own.id] });
    expect(errorCode(self)).toBe('PROJECT_TIME_INVALID');
    const denied = await scenario.post(approvePath, developer.session, { ids: [first.id] });
    expect(denied.status).toBe(403);
    const approved = await scenario.post(approvePath, leader.session, { ids: [first.id] });
    expect(approved.status, approved.text).toBe(201);
    const locked = await scenario.put(
      `/v1/projects/${id}/time-entries/${first.id}`,
      developer,
      { work_date: scenario.day(0), hours: 1, item_id: null, billable: true, note: null },
      first.version + 1,
    );
    expect(errorCode(locked)).toBe('PROJECT_STATUS_INVALID');
    expect(await scenario.auditActions(first.id)).toEqual([
      'project.time.log',
      'project.time.approve',
    ]);
  });
});

describe('devolver horas', () => {
  it('devolver avisa a la persona y los indicadores separan lo aprobado', async () => {
    const { leader, developer, id } = await teamProject();
    const { first, second } = await logged(leader, developer, id);
    const approvePath = `/v1/projects/${id}/time-entries/actions/approve`;
    await scenario.post(approvePath, leader.session, { ids: [first.id] });
    const returned = await scenario.action(
      `/v1/projects/${id}/time-entries/${second.id}/actions/return`,
      leader,
      second.version,
      { reason: 'Indique en qué ítem trabajó.' },
    );
    expect(returned.status, returned.text).toBe(204);
    await scenario.dispatchNotices();
    expect((await scenario.noticesFor(developer.id)).join(' ')).toContain('devolvieron');
    const indicators = await scenario.indicators(leader, id);
    expect(indicators.hours).toMatchObject({ logged: 10, approved: 4, billable: 4, pending: 4 });
  });
});

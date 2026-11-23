import { ideaListResponseSchema, INN_ERROR_CODES } from '@arza/contracts';
import { expect, it } from 'vitest';

import { auditActions, errorCode } from '../iam/support/iam-fixtures.js';
import { AccessScenario } from '../iam/support/access-scenario.js';
import { at, evaluated, IDEA, innFixture, proposed, VIABILITY } from './support/inn-fixture.js';

// Banco de ideas (B40, ficha 17.16; decisiones 2 y 3): todo colaborador propone y ve las suyas;
// la Dirección y Calidad evalúan con el FT-INN-003 y deciden, nunca sobre su propia idea.

const scenario = new AccessScenario('innovacion ideas');

it('el colaborador propone y ve solo sus ideas; corrige mientras sigue inscrita', async () => {
  const f = await innFixture(scenario, 'propone');
  const id = await proposed(scenario, f.worker);
  const other = await proposed(scenario, f.tech);
  expect((await scenario.get('/v1/innovation/ideas', f.worker.session)).status).toBe(403);
  const mine = ideaListResponseSchema.parse(
    (await scenario.get('/v1/innovation/my/ideas', f.worker.session)).body,
  );
  expect(mine.data.map((idea) => idea.id)).toContain(id);
  expect(mine.data.map((idea) => idea.id)).not.toContain(other);
  expect(mine.data.find((idea) => idea.id === id)).toMatchObject({
    stage: 'registered',
    proposer: { id: f.worker.id },
  });
  expect(mine.data.find((idea) => idea.id === id)?.code).toMatch(/^IDE-\d{4}-\d{4}$/);
  const edited = { ...IDEA, title: 'Conciliación bancaria asistida' };
  const path = `/v1/innovation/ideas/${id}`;
  expect((await scenario.patch(path, f.tech.session, edited, 1)).status).toBe(404);
  expect((await scenario.patch(path, f.worker.session, edited, 1)).status).toBe(204);
  expect((await scenario.patch(path, f.worker.session, edited, 1)).status).toBe(409);
  const all = ideaListResponseSchema.parse(
    (await scenario.get('/v1/innovation/ideas?stage=registered', f.auditor.session)).body,
  );
  expect(all.data.find((idea) => idea.id === id)?.title).toBe('Conciliación bancaria asistida');
});

it('la idea recorre inscrita, evaluación, aprobada, desarrollo e implementada', async () => {
  const f = await innFixture(scenario, 'recorrido');
  const id = await evaluated(scenario, f);
  const base = `/v1/innovation/ideas/${id}`;
  expect((await scenario.patch(base, f.worker.session, IDEA, 3)).status).toBe(409);
  const approve = { decision: 'approve', note: 'Se incluye en la hoja de ruta.' };
  expect((await at(scenario, `${base}/decision`, f.tech, 3, approve)).status).toBe(403);
  expect((await at(scenario, `${base}/decision`, f.quality, 3, approve)).status).toBe(204);
  const progress = (stage: string, version: number) =>
    at(scenario, `${base}/progress`, f.director, version, { stage });
  expect((await progress('implemented', 4)).status).toBe(409);
  expect((await progress('in_development', 4)).status).toBe(204);
  expect((await progress('implemented', 5)).status).toBe(204);
  const list = ideaListResponseSchema.parse(
    (await scenario.get('/v1/innovation/ideas', f.director.session)).body,
  );
  expect(list.data.find((idea) => idea.id === id)).toMatchObject({
    stage: 'implemented',
    evaluator: { id: f.director.id },
    decided_by: { id: f.quality.id },
    viability: { total: 20, concept: 'viable', evaluated_by: { id: f.director.id } },
  });
  const stored = await scenario.inTenant((tx) => tx.innIdea.findFirstOrThrow({ where: { id } }));
  expect(stored.viabilityRecordCode).toMatch(/^FT-INN-003-/);
  const record = await scenario.inTenant((tx) =>
    tx.docFormRecord.findFirstOrThrow({ where: { id: stored.viabilityRecordId ?? '' } }),
  );
  expect(record).toMatchObject({ entityType: 'inn_idea', entityId: id });
  expect(await auditActions(scenario.db, scenario.tenant.id, id)).toEqual([
    'inn.idea.create:success',
    'inn.idea.evaluate:success',
    'inn.idea.viability:success',
    'inn.idea.approve:success',
    'inn.idea.progress:success',
    'inn.idea.progress:success',
  ]);
});

it('nadie evalúa ni decide su propia idea (decisión 3)', async () => {
  const f = await innFixture(scenario, 'propia');
  const id = await proposed(scenario, f.quality);
  const base = `/v1/innovation/ideas/${id}`;
  const own = await at(scenario, `${base}/evaluation`, f.quality, 1);
  expect(own.status).toBe(403);
  expect(errorCode(own)).toBe(INN_ERROR_CODES.selfDecision);
  const archive = { decision: 'archive', note: 'No es prioridad.' };
  expect(errorCode(await at(scenario, `${base}/decision`, f.quality, 1, archive))).toBe(
    INN_ERROR_CODES.selfDecision,
  );
  expect((await at(scenario, `${base}/evaluation`, f.director, 1)).status).toBe(204);
});

it('aprobar exige la evaluación y un concepto distinto de no viable', async () => {
  const f = await innFixture(scenario, 'aprobar');
  const id = await proposed(scenario, f.worker);
  const base = `/v1/innovation/ideas/${id}`;
  const approve = { decision: 'approve', note: 'Se aprueba de una vez.' };
  expect((await at(scenario, `${base}/viability`, f.director, 1, VIABILITY)).status).toBe(409);
  expect((await at(scenario, `${base}/evaluation`, f.director, 1)).status).toBe(204);
  expect((await at(scenario, `${base}/decision`, f.director, 2, approve)).status).toBe(409);
  const notViable = { ...VIABILITY, concept: 'not_viable' };
  expect((await at(scenario, `${base}/viability`, f.director, 2, notViable)).status).toBe(204);
  expect((await at(scenario, `${base}/decision`, f.director, 3, approve)).status).toBe(409);
  const archive = { decision: 'archive', note: 'No es viable por ahora.' };
  expect((await at(scenario, `${base}/decision`, f.director, 3, archive)).status).toBe(204);
  expect((await at(scenario, `${base}/decision`, f.director, 4, archive)).status).toBe(409);
  const bad = { ...VIABILITY, scores: { ...VIABILITY.scores, risk: 9 } };
  const fresh = await proposed(scenario, f.worker);
  await at(scenario, `/v1/innovation/ideas/${fresh}/evaluation`, f.director, 1);
  const invalid = await at(scenario, `/v1/innovation/ideas/${fresh}/viability`, f.director, 2, bad);
  expect(invalid.status).toBe(422);
});

it('los pasos fuera de orden o sobre una versión vieja no avanzan la idea', async () => {
  const f = await innFixture(scenario, 'orden');
  const id = await proposed(scenario, f.worker);
  const base = `/v1/innovation/ideas/${id}`;
  const approve = { decision: 'approve', note: 'Adelante.' };
  expect((await at(scenario, `${base}/decision`, f.director, 1, approve)).status).toBe(409);
  expect((await at(scenario, `${base}/evaluation`, f.director, 7)).status).toBe(409);
  expect((await at(scenario, `${base}/evaluation`, f.director, 1)).status).toBe(204);
  expect((await at(scenario, `${base}/evaluation`, f.director, 2)).status).toBe(409);
  const ghost = '/v1/innovation/ideas/01900000-0000-7000-8000-00000000dead/viability';
  expect((await at(scenario, ghost, f.director, 1, VIABILITY)).status).toBe(404);
});

it('el PDF de la evaluación se pide cuando la idea tiene evaluación', async () => {
  const f = await innFixture(scenario, 'pdf');
  const pending = await proposed(scenario, f.worker);
  const link = (id: string) => `/v1/innovation/ideas/${id}/viability/download-link`;
  expect((await scenario.post(link(pending), f.auditor.session)).status).toBe(409);
  const id = await evaluated(scenario, f);
  expect((await scenario.post(link(id), f.worker.session)).status).toBe(403);
  expect((await scenario.post(link(id), f.auditor.session)).status).toBe(409);
  const ghost = link('01900000-0000-7000-8000-00000000dead');
  expect((await scenario.post(ghost, f.auditor.session)).status).toBe(404);
});

it('otra empresa no ve ni decide las ideas', async () => {
  const f = await innFixture(scenario, 'aislamiento');
  const id = await proposed(scenario, f.worker);
  const stranger = await scenario.person('idea-ajena', ['DIRECCION'], {
    tenantId: scenario.otherTenant.id,
  });
  const theirs = ideaListResponseSchema.parse(
    (await scenario.get('/v1/innovation/ideas', stranger.session)).body,
  );
  expect(theirs.data.map((idea) => idea.id)).not.toContain(id);
  expect((await at(scenario, `/v1/innovation/ideas/${id}/evaluation`, stranger, 1)).status).toBe(
    404,
  );
});

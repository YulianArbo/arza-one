import {
  competitorListResponseSchema,
  roadmapListResponseSchema,
  roadmapReleaseResponseSchema,
  watchListResponseSchema,
} from '@arza/contracts';
import { expect, it } from 'vitest';

import { AccessScenario } from '../iam/support/access-scenario.js';
import { at, created, evaluated, innFixture, later } from './support/inn-fixture.js';

// Hoja de ruta de productos propios (FT-INN-004; decisiones 7 y 9), vigilancia tecnológica
// (FT-INN-006) y análisis de competencia (RE-INN-002) (B40, ficha 17.16).

const scenario = new AccessScenario('innovacion hoja de ruta');

function item(ownerId: string, ideaId: string | null = null) {
  return {
    product: 'ARZA ONE',
    title: 'Conciliación bancaria',
    quarter: '2027-T2',
    owner_id: ownerId,
    idea_id: ideaId,
  };
}

/** El registro de software propuesto y la tarea de radicarlo para el responsable del hito. */
async function expectProposal(assetId: string, ownerId: string): Promise<void> {
  const asset = await scenario.inTenant((tx) =>
    tx.innIpAsset.findFirstOrThrow({ where: { id: assetId } }),
  );
  expect(asset).toMatchObject({
    kind: 'software',
    status: 'proposed',
    title: 'ARZA ONE 2.1.0',
    responsibleId: ownerId,
    office: 'Dirección Nacional de Derecho de Autor',
  });
  const task = await scenario.inTenant((tx) =>
    tx.workflowTask.findFirstOrThrow({ where: { instance: { entityId: assetId } } }),
  );
  expect(task).toMatchObject({ assigneeId: ownerId, status: 'pending' });
  expect(task.title).toContain('Radicar el registro de ARZA ONE 2.1.0');
}

it('liberar una versión propone su registro y le da la tarea al responsable (decisión 7)', async () => {
  const f = await innFixture(scenario, 'liberar');
  const idea = await evaluated(scenario, f);
  const approve = { decision: 'approve', note: 'Va para el segundo trimestre.' };
  await at(scenario, `/v1/innovation/ideas/${idea}/decision`, f.quality, 3, approve);
  const body = item(f.tech.id, idea);
  expect((await scenario.post('/v1/innovation/roadmap', f.tech.session, body)).status).toBe(403);
  const id = created(await scenario.post('/v1/innovation/roadmap', f.quality.session, body));
  const path = `/v1/innovation/roadmap/${id}`;
  const moved = { ...body, status: 'in_progress' };
  expect((await scenario.patch(path, f.quality.session, moved, 1)).status).toBe(204);
  const release = { version_label: '2.1.0', released_on: later(scenario, 0) };
  const response = await at(scenario, `${path}/release`, f.quality, 2, release);
  expect(response.status).toBe(200);
  const { ip_asset_id: assetId } = roadmapReleaseResponseSchema.parse(response.body);
  expect((await at(scenario, `${path}/release`, f.quality, 3, release)).status).toBe(409);
  expect((await scenario.patch(path, f.quality.session, moved, 3)).status).toBe(409);
  await expectProposal(assetId, f.tech.id);
  const list = roadmapListResponseSchema.parse(
    (await scenario.get('/v1/innovation/roadmap', f.auditor.session)).body,
  );
  expect(list.products).toContain('ARZA ONE');
  expect(list.data.find((entry) => entry.id === id)).toMatchObject({
    status: 'released',
    version_label: '2.1.0',
    idea: { id: idea },
    ip_asset: { id: assetId },
  });
});

it('el hito solo nace de una idea aprobada y el trimestre se valida', async () => {
  const f = await innFixture(scenario, 'hito');
  const idea = await evaluated(scenario, f);
  const path = '/v1/innovation/roadmap';
  expect((await scenario.post(path, f.quality.session, item(f.tech.id, idea))).status).toBe(422);
  const wrong = { ...item(f.tech.id), quarter: '2027-Q2' };
  expect((await scenario.post(path, f.quality.session, wrong)).status).toBe(422);
  const id = created(await scenario.post(path, f.quality.session, item(f.tech.id)));
  const cancelled = { ...item(f.tech.id), status: 'cancelled' };
  expect((await scenario.patch(`${path}/${id}`, f.quality.session, cancelled, 1)).status).toBe(204);
  const release = { version_label: '1.0.0', released_on: later(scenario, 0) };
  expect((await at(scenario, `${path}/${id}/release`, f.quality, 2, release)).status).toBe(409);
  expect((await scenario.get(path, f.worker.session)).status).toBe(403);
  const ghost = '/v1/innovation/roadmap/01900000-0000-7000-8000-00000000dead';
  expect((await scenario.patch(ghost, f.quality.session, item(f.tech.id), 1)).status).toBe(404);
});

it('el Líder técnico registra la vigilancia; el colaborador y otra empresa no', async () => {
  const f = await innFixture(scenario, 'vigilancia');
  const finding = {
    topic: 'Facturación electrónica',
    source: 'Resolución de la DIAN',
    finding: 'Cambia el anexo técnico del documento soporte.',
    relevance: 'high',
    observed_on: later(scenario, 0),
  };
  expect((await scenario.post('/v1/innovation/watch', f.worker.session, finding)).status).toBe(403);
  const id = created(await scenario.post('/v1/innovation/watch', f.tech.session, finding));
  const edited = { ...finding, relevance: 'medium' };
  expect(
    (await scenario.patch(`/v1/innovation/watch/${id}`, f.tech.session, edited, 1)).status,
  ).toBe(204);
  expect(
    (await scenario.patch(`/v1/innovation/watch/${id}`, f.tech.session, edited, 1)).status,
  ).toBe(409);
  const watch = watchListResponseSchema.parse(
    (await scenario.get('/v1/innovation/watch', f.auditor.session)).body,
  );
  expect(watch.data.find((entry) => entry.id === id)).toMatchObject({
    relevance: 'medium',
    recorded_by: { id: f.tech.id },
  });
  const stranger = await scenario.person('vigilancia-ajena', ['LIDER_TECNICO'], {
    tenantId: scenario.otherTenant.id,
  });
  const theirs = watchListResponseSchema.parse(
    (await scenario.get('/v1/innovation/watch', stranger.session)).body,
  );
  expect(theirs.data.map((entry) => entry.id)).not.toContain(id);
  const path = `/v1/innovation/watch/${id}`;
  expect((await scenario.patch(path, stranger.session, edited, 2)).status).toBe(404);
});

it('la competencia la registran Calidad y el Líder técnico; otra empresa no la toca', async () => {
  const f = await innFixture(scenario, 'competencia');
  const rival = {
    name: 'Competidor de prueba',
    segment: 'Software empresarial',
    strengths: 'Marca conocida',
    weaknesses: 'Soporte lento',
    updated_on: later(scenario, 0),
  };
  const rivalId = created(
    await scenario.post('/v1/innovation/competitors', f.quality.session, rival),
  );
  const patched = { ...rival, website: 'https://competidor.example' };
  const rivalPath = `/v1/innovation/competitors/${rivalId}`;
  expect((await scenario.patch(rivalPath, f.tech.session, patched, 1)).status).toBe(204);
  const ghost = '/v1/innovation/competitors/01900000-0000-7000-8000-00000000dead';
  expect((await scenario.patch(ghost, f.tech.session, patched, 1)).status).toBe(404);
  const rivals = competitorListResponseSchema.parse(
    (await scenario.get('/v1/innovation/competitors', f.director.session)).body,
  );
  expect(rivals.data.find((entry) => entry.id === rivalId)?.website).toBe(
    'https://competidor.example',
  );
  const stranger = await scenario.person('competencia-ajena', ['LIDER_TECNICO'], {
    tenantId: scenario.otherTenant.id,
  });
  const theirs = competitorListResponseSchema.parse(
    (await scenario.get('/v1/innovation/competitors', stranger.session)).body,
  );
  expect(theirs.data.map((entry) => entry.id)).not.toContain(rivalId);
  expect((await scenario.patch(rivalPath, stranger.session, patched, 2)).status).toBe(404);
});

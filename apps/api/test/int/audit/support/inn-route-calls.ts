import type request from 'supertest';

import type { AccessScenario } from '../../iam/support/access-scenario.js';
import { availableFile } from '../../hr/support/people-fixture.js';
import {
  at,
  coded,
  created,
  evaluated,
  innFixture,
  later,
  proposed,
  remove,
  software,
  trademark,
  VIABILITY,
  type InnStaff,
} from '../../inn/support/inn-fixture.js';

// Rutas de Innovación y propiedad intelectual (B40) que escriben, para el recorrido de auditoría.

interface PendingRequest {
  readonly test: request.Test;
}

type RouteCall = (scenario: AccessScenario) => Promise<PendingRequest>;

function final(test: request.Test): PendingRequest {
  return { test };
}

const IDEAS = '/v1/innovation/ideas';
const ASSETS = '/v1/innovation/ip-assets';

function roadmapItem(f: InnStaff) {
  return {
    product: 'ARZA ONE',
    title: 'Tablero de ventas',
    quarter: '2027-T3',
    owner_id: f.tech.id,
  };
}

function finding(s: AccessScenario) {
  return {
    topic: 'Firma electrónica',
    source: 'Boletín sectorial',
    finding: 'Nuevos requisitos de estampado cronológico.',
    relevance: 'medium',
    observed_on: later(s, 0),
  };
}

function rival(s: AccessScenario) {
  return {
    name: 'Competidor del recorrido',
    segment: 'ERP',
    strengths: 'Precio',
    weaknesses: 'Soporte',
    updated_on: later(s, 0),
  };
}

/** Evaluada y con el PDF del FT-INN-003 ya generado. */
async function withPdf(s: AccessScenario, f: InnStaff): Promise<string> {
  const id = await evaluated(s, f);
  const file = await availableFile(s, f.director);
  await s.inTenant(async (tx) => {
    const idea = await tx.innIdea.findFirstOrThrow({ where: { id } });
    await tx.docFormRecord.update({
      where: { id: idea.viabilityRecordId ?? '' },
      data: { renderStatus: 'ready', pdfFileId: file },
    });
  });
  return id;
}

async function softwareWithAuthor(s: AccessScenario, label: string) {
  const f = await innFixture(s, label);
  const { id } = coded(await s.post(ASSETS, f.quality.session, software(f.quality.id)));
  const file = await availableFile(s, f.quality);
  const author = { name: 'Autor del recorrido', support_kind: 'document', support_file_id: file };
  const authorId = created(await s.post(`${ASSETS}/${id}/authors`, f.quality.session, author));
  return { f, id, authorId, file };
}

const IDEA_CALLS: Readonly<Record<string, RouteCall>> = {
  'POST /v1/innovation/ideas': async (s) => {
    const f = await innFixture(s, 'auditoria-idea');
    return final(
      s.post(IDEAS, f.worker.session, {
        title: 'Idea del recorrido',
        description: 'Una idea para el recorrido de auditoría.',
      }),
    );
  },
  'PATCH /v1/innovation/ideas/{id}': async (s) => {
    const f = await innFixture(s, 'auditoria-idea-cambio');
    const id = await proposed(s, f.worker);
    const body = { title: 'Idea corregida', description: 'Una idea corregida en el recorrido.' };
    return final(s.patch(`${IDEAS}/${id}`, f.worker.session, body, 1));
  },
  'POST /v1/innovation/ideas/{id}/evaluation': async (s) => {
    const f = await innFixture(s, 'auditoria-evaluacion');
    const id = await proposed(s, f.worker);
    return final(at(s, `${IDEAS}/${id}/evaluation`, f.director, 1));
  },
  'POST /v1/innovation/ideas/{id}/viability': async (s) => {
    const f = await innFixture(s, 'auditoria-viabilidad');
    const id = await proposed(s, f.worker);
    await at(s, `${IDEAS}/${id}/evaluation`, f.director, 1);
    return final(at(s, `${IDEAS}/${id}/viability`, f.director, 2, VIABILITY));
  },
  'POST /v1/innovation/ideas/{id}/decision': async (s) => {
    const f = await innFixture(s, 'auditoria-decision');
    const id = await evaluated(s, f);
    const body = { decision: 'approve', note: 'Aprobada en el recorrido.' };
    return final(at(s, `${IDEAS}/${id}/decision`, f.quality, 3, body));
  },
  'POST /v1/innovation/ideas/{id}/progress': async (s) => {
    const f = await innFixture(s, 'auditoria-avance');
    const id = await evaluated(s, f);
    const body = { decision: 'approve', note: 'Aprobada en el recorrido.' };
    await at(s, `${IDEAS}/${id}/decision`, f.quality, 3, body);
    return final(at(s, `${IDEAS}/${id}/progress`, f.director, 4, { stage: 'in_development' }));
  },
  'POST /v1/innovation/ideas/{id}/viability/download-link': async (s) => {
    const f = await innFixture(s, 'auditoria-viabilidad-pdf');
    const id = await withPdf(s, f);
    return final(s.post(`${IDEAS}/${id}/viability/download-link`, f.auditor.session));
  },
};

const ASSET_CALLS: Readonly<Record<string, RouteCall>> = {
  'POST /v1/innovation/ip-assets': async (s) => {
    const f = await innFixture(s, 'auditoria-activo');
    return final(s.post(ASSETS, f.quality.session, trademark(s, f.quality.id, 500)));
  },
  'PATCH /v1/innovation/ip-assets/{id}': async (s) => {
    const f = await innFixture(s, 'auditoria-activo-cambio');
    const body = trademark(s, f.quality.id, 500);
    const { id } = coded(await s.post(ASSETS, f.quality.session, body));
    const renewed = { ...body, expires_on: later(s, 4000) };
    return final(s.patch(`${ASSETS}/${id}`, f.quality.session, renewed, 1));
  },
  'POST /v1/innovation/ip-assets/export': async (s) => {
    const f = await innFixture(s, 'auditoria-portafolio');
    return final(s.post(`${ASSETS}/export`, f.auditor.session));
  },
  'POST /v1/innovation/ip-assets/{id}/authors': async (s) => {
    const f = await innFixture(s, 'auditoria-autor');
    const { id } = coded(await s.post(ASSETS, f.quality.session, software(f.quality.id)));
    const file = await availableFile(s, f.quality);
    const author = { name: 'Autor externo', support_kind: 'document', support_file_id: file };
    return final(s.post(`${ASSETS}/${id}/authors`, f.quality.session, author));
  },
  'DELETE /v1/innovation/ip-assets/{id}/authors/{authorId}': async (s) => {
    const { f, id, authorId } = await softwareWithAuthor(s, 'auditoria-autor-quita');
    return final(remove(s, `${ASSETS}/${id}/authors/${authorId}`, f.quality));
  },
  'POST /v1/innovation/ip-assets/{id}/certificate/download-link': async (s) => {
    const f = await innFixture(s, 'auditoria-certificado');
    const file = await availableFile(s, f.quality);
    const body = { ...trademark(s, f.quality.id, 500), certificate_file_id: file };
    const { id } = coded(await s.post(ASSETS, f.quality.session, body));
    return final(s.post(`${ASSETS}/${id}/certificate/download-link`, f.director.session));
  },
};

const ROADMAP_WATCH_CALLS: Readonly<Record<string, RouteCall>> = {
  'POST /v1/innovation/roadmap': async (s) => {
    const f = await innFixture(s, 'auditoria-hito');
    return final(s.post('/v1/innovation/roadmap', f.quality.session, roadmapItem(f)));
  },
  'PATCH /v1/innovation/roadmap/{id}': async (s) => {
    const f = await innFixture(s, 'auditoria-hito-cambio');
    const id = created(await s.post('/v1/innovation/roadmap', f.quality.session, roadmapItem(f)));
    const body = { ...roadmapItem(f), status: 'in_progress' };
    return final(s.patch(`/v1/innovation/roadmap/${id}`, f.quality.session, body, 1));
  },
  'POST /v1/innovation/roadmap/{id}/release': async (s) => {
    const f = await innFixture(s, 'auditoria-liberacion');
    const id = created(await s.post('/v1/innovation/roadmap', f.quality.session, roadmapItem(f)));
    const body = { version_label: '3.0.0', released_on: later(s, 0) };
    return final(at(s, `/v1/innovation/roadmap/${id}/release`, f.quality, 1, body));
  },
  'POST /v1/innovation/watch': async (s) => {
    const f = await innFixture(s, 'auditoria-vigilancia');
    return final(s.post('/v1/innovation/watch', f.tech.session, finding(s)));
  },
  'PATCH /v1/innovation/watch/{id}': async (s) => {
    const f = await innFixture(s, 'auditoria-vigilancia-cambio');
    const id = created(await s.post('/v1/innovation/watch', f.tech.session, finding(s)));
    const body = { ...finding(s), relevance: 'high' };
    return final(s.patch(`/v1/innovation/watch/${id}`, f.tech.session, body, 1));
  },
  'POST /v1/innovation/competitors': async (s) => {
    const f = await innFixture(s, 'auditoria-competidor');
    return final(s.post('/v1/innovation/competitors', f.quality.session, rival(s)));
  },
  'PATCH /v1/innovation/competitors/{id}': async (s) => {
    const f = await innFixture(s, 'auditoria-competidor-cambio');
    const id = created(await s.post('/v1/innovation/competitors', f.quality.session, rival(s)));
    const body = { ...rival(s), segment: 'CRM' };
    return final(s.patch(`/v1/innovation/competitors/${id}`, f.tech.session, body, 1));
  },
};

export const INN_ROUTE_CALLS: Readonly<Record<string, RouteCall>> = {
  ...IDEA_CALLS,
  ...ASSET_CALLS,
  ...ROADMAP_WATCH_CALLS,
};

import type request from 'supertest';

import type { AccessScenario } from '../../iam/support/access-scenario.js';
import { reviewBody } from '../../qms/support/qms-b39-fixture.js';
import {
  at,
  coded,
  later,
  qualityFixture,
  type QualityStaff,
} from '../../qms/support/qms-fixture.js';

// Rutas de la revisión por la dirección del B39 que escriben, para el recorrido de auditoría.

interface PendingRequest {
  readonly test: request.Test;
}

type RouteCall = (scenario: AccessScenario) => Promise<PendingRequest>;

function final(test: request.Test): PendingRequest {
  return { test };
}

function preparation(f: QualityStaff, s: AccessScenario) {
  return {
    attendees: 'Dirección y Calidad',
    conclusions: 'El sistema es eficaz.',
    decisions: [
      { description: 'Revisar la política.', responsible_id: f.worker.id, due_on: later(s, 30) },
    ],
  };
}

async function draft(s: AccessScenario, label: string) {
  const f = await qualityFixture(s, label);
  const { id } = coded(
    await s.post('/v1/qms/management-reviews', f.quality.session, reviewBody(s)),
  );
  return { f, base: `/v1/qms/management-reviews/${id}` };
}

/** Precargada, preparada y enviada (versión 4). */
async function submitted(s: AccessScenario, label: string) {
  const { f, base } = await draft(s, label);
  await at(s, `${base}/actions/load-inputs`, f.quality, 1);
  await s.patch(base, f.quality.session, preparation(f, s), 2);
  await at(s, `${base}/actions/submit`, f.quality, 3);
  return { f, base };
}

export const QMS_REVIEW_ROUTE_CALLS: Readonly<Record<string, RouteCall>> = {
  'POST /v1/qms/management-reviews': async (s) => {
    const f = await qualityFixture(s, 'auditoria-acta');
    return final(s.post('/v1/qms/management-reviews', f.quality.session, reviewBody(s)));
  },
  'PATCH /v1/qms/management-reviews/{id}': async (s) => {
    const { f, base } = await draft(s, 'auditoria-acta-cambio');
    return final(s.patch(base, f.quality.session, preparation(f, s), 1));
  },
  'POST /v1/qms/management-reviews/{id}/actions/load-inputs': async (s) => {
    const { f, base } = await draft(s, 'auditoria-acta-entradas');
    return final(at(s, `${base}/actions/load-inputs`, f.quality, 1));
  },
  'POST /v1/qms/management-reviews/{id}/actions/submit': async (s) => {
    const { f, base } = await draft(s, 'auditoria-acta-envio');
    await at(s, `${base}/actions/load-inputs`, f.quality, 1);
    await s.patch(base, f.quality.session, preparation(f, s), 2);
    return final(at(s, `${base}/actions/submit`, f.quality, 3));
  },
  'POST /v1/qms/management-reviews/{id}/actions/return': async (s) => {
    const { f, base } = await submitted(s, 'auditoria-acta-devuelve');
    const reason = { reason: 'Falta el análisis de recursos.' };
    return final(at(s, `${base}/actions/return`, f.director, 4, reason));
  },
  'POST /v1/qms/management-reviews/{id}/actions/approve': async (s) => {
    const { f, base } = await submitted(s, 'auditoria-acta-aprueba');
    return final(at(s, `${base}/actions/approve`, f.director, 4));
  },
};

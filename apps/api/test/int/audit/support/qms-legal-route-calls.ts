import type request from 'supertest';

import type { AccessScenario } from '../../iam/support/access-scenario.js';
import { put } from '../../qms/support/qms-b39-fixture.js';
import { coded, qualityFixture } from '../../qms/support/qms-fixture.js';
import {
  complies,
  legalCsv,
  objectiveBody,
  requirement,
  requirementBody,
} from '../../qms/support/qms-legal-fixture.js';

// Rutas del normograma y de los objetivos estratégicos del B46 que escriben, para el recorrido de
// auditoría.

interface PendingRequest {
  readonly test: request.Test;
}

type RouteCall = (scenario: AccessScenario) => Promise<PendingRequest>;

const LEGAL = '/v1/qms/legal-requirements';
const OBJECTIVES = '/v1/qms/strategic-objectives';

function final(test: request.Test): PendingRequest {
  return { test };
}

async function objective(s: AccessScenario, label: string) {
  const f = await qualityFixture(s, label);
  const { id } = coded(await s.post(OBJECTIVES, f.quality.session, objectiveBody()));
  return { f, id };
}

export const QMS_LEGAL_ROUTE_CALLS: Readonly<Record<string, RouteCall>> = {
  [`POST ${LEGAL}`]: async (s) => {
    const f = await qualityFixture(s, 'auditoria-normograma');
    return final(s.post(LEGAL, f.quality.session, requirementBody()));
  },
  [`PATCH ${LEGAL}/{id}`]: async (s) => {
    const f = await qualityFixture(s, 'auditoria-normograma-cambio');
    const { id } = await requirement(s, f);
    return final(s.patch(`${LEGAL}/${id}`, f.quality.session, requirementBody(), 1));
  },
  [`POST ${LEGAL}/export`]: async (s) => {
    const f = await qualityFixture(s, 'auditoria-normograma-descarga');
    return final(s.post(`${LEGAL}/export`, f.director.session));
  },
  [`POST ${LEGAL}/import`]: async (s) => {
    const f = await qualityFixture(s, 'auditoria-normograma-carga');
    const row = [
      'Ley',
      `Ley ${crypto.randomUUID().slice(0, 8)}`,
      'Congreso',
      '',
      'Requisito.',
      '',
      '',
      'Sí',
    ];
    return final(
      s.post(`${LEGAL}/import`, f.quality.session, { content: legalCsv([row]), apply: true }),
    );
  },
  [`POST ${LEGAL}/{id}/evaluations`]: async (s) => {
    const f = await qualityFixture(s, 'auditoria-normograma-evalua');
    const { id } = await requirement(s, f);
    return final(s.post(`${LEGAL}/${id}/evaluations`, f.director.session, complies(s)));
  },
  [`POST ${OBJECTIVES}`]: async (s) => {
    const f = await qualityFixture(s, 'auditoria-objetivo');
    return final(s.post(OBJECTIVES, f.quality.session, objectiveBody()));
  },
  [`PATCH ${OBJECTIVES}/{id}`]: async (s) => {
    const { f, id } = await objective(s, 'auditoria-objetivo-cambio');
    return final(s.patch(`${OBJECTIVES}/${id}`, f.quality.session, objectiveBody(), 1));
  },
  [`PUT ${OBJECTIVES}/{id}/indicators`]: async (s) => {
    const { f, id } = await objective(s, 'auditoria-objetivo-indicadores');
    return final(put(s, `${OBJECTIVES}/${id}/indicators`, f.quality, 1, { indicator_ids: [] }));
  },
};

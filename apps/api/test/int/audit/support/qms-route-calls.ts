import type request from 'supertest';

import type { AccessScenario } from '../../iam/support/access-scenario.js';
import {
  actionBody,
  analyzed,
  at,
  coded,
  created,
  executed,
  later,
  plannedNonconformity,
  processId,
  qualityFixture,
  reported,
  today,
  verification,
  type QualityStaff,
} from '../../qms/support/qms-fixture.js';

// Rutas de Calidad del B38 que escriben, para el recorrido de auditoría.

interface PendingRequest {
  readonly test: request.Test;
}

type RouteCall = (scenario: AccessScenario) => Promise<PendingRequest>;

function final(test: request.Test): PendingRequest {
  return { test };
}

const CHARACTERIZATION = {
  process_type: 'core',
  objective: 'Entregar el software acordado con el cliente.',
};

const CONTEXT = {
  kind: 'opportunity',
  pestel_factor: 'technological',
  description: 'Nuevas herramientas de inteligencia artificial',
  impact: 'medium',
  year: 2026,
};

const STAKEHOLDER = {
  name: 'Proveedores',
  stakeholder_type: 'external',
  needs: 'Pago oportuno',
  expectations: 'Relación de largo plazo',
};

const LESSON = {
  title: 'Probar antes de entregar',
  context: 'Una entrega salió sin pruebas.',
  lesson: 'Toda entrega pasa por la lista de verificación.',
};

async function riskBody(s: AccessScenario, f: QualityStaff) {
  return {
    kind: 'risk',
    process_id: await processId(s),
    description: 'Rotación del equipo técnico',
    probability: 3,
    impact: 4,
    treatment: 'mitigate',
    owner_id: f.quality.id,
    review_on: later(s, 90),
  };
}

/** Una no conformidad verificada, lista para cerrarse o reabrirse (versión 5). */
async function verifiedNonconformity(s: AccessScenario, f: QualityStaff): Promise<string> {
  const { id, actionId } = await plannedNonconformity(s, f);
  await executed(s, f.worker, actionId);
  await at(s, `/v1/qms/actions/${actionId}/actions/verify`, f.verifier, 2, verification(s, true));
  return id;
}

const NC = '/v1/qms/nonconformities';

export const QMS_ROUTE_CALLS: Readonly<Record<string, RouteCall>> = {
  'POST /v1/qms/processes/{id}/characterization': async (s) => {
    const f = await qualityFixture(s, 'auditoria-caracteriza');
    const path = `/v1/qms/processes/${await processId(s, 2)}/characterization`;
    return final(s.post(path, f.quality.session, CHARACTERIZATION));
  },
  'PATCH /v1/qms/characterizations/{id}': async (s) => {
    const f = await qualityFixture(s, 'auditoria-caracteriza-cambio');
    const path = `/v1/qms/processes/${await processId(s, 3)}/characterization`;
    const id = created(await s.post(path, f.quality.session, CHARACTERIZATION));
    const body = { ...CHARACTERIZATION, process_type: 'support' };
    return final(s.patch(`/v1/qms/characterizations/${id}`, f.quality.session, body, 1));
  },
  'POST /v1/qms/context': async (s) => {
    const f = await qualityFixture(s, 'auditoria-contexto');
    return final(s.post('/v1/qms/context', f.quality.session, CONTEXT));
  },
  'PATCH /v1/qms/context/{id}': async (s) => {
    const f = await qualityFixture(s, 'auditoria-contexto-cambio');
    const id = created(await s.post('/v1/qms/context', f.quality.session, CONTEXT));
    const body = { ...CONTEXT, impact: 'high' };
    return final(s.patch(`/v1/qms/context/${id}`, f.quality.session, body, 1));
  },
  'POST /v1/qms/stakeholders': async (s) => {
    const f = await qualityFixture(s, 'auditoria-parte');
    return final(s.post('/v1/qms/stakeholders', f.quality.session, STAKEHOLDER));
  },
  'PATCH /v1/qms/stakeholders/{id}': async (s) => {
    const f = await qualityFixture(s, 'auditoria-parte-cambio');
    const id = created(await s.post('/v1/qms/stakeholders', f.quality.session, STAKEHOLDER));
    const body = { ...STAKEHOLDER, monitoring: 'Reunión trimestral' };
    return final(s.patch(`/v1/qms/stakeholders/${id}`, f.quality.session, body, 1));
  },
  'POST /v1/qms/risks': async (s) => {
    const f = await qualityFixture(s, 'auditoria-riesgo');
    return final(s.post('/v1/qms/risks', f.quality.session, await riskBody(s, f)));
  },
  'PATCH /v1/qms/risks/{id}': async (s) => {
    const f = await qualityFixture(s, 'auditoria-riesgo-cambio');
    const body = await riskBody(s, f);
    const id = created(await s.post('/v1/qms/risks', f.quality.session, body));
    return final(s.patch(`/v1/qms/risks/${id}`, f.quality.session, { ...body, impact: 2 }, 1));
  },
  'POST /v1/qms/lessons': async (s) => {
    const f = await qualityFixture(s, 'auditoria-leccion');
    return final(s.post('/v1/qms/lessons', f.quality.session, LESSON));
  },
  'PATCH /v1/qms/lessons/{id}': async (s) => {
    const f = await qualityFixture(s, 'auditoria-leccion-cambio');
    const id = created(await s.post('/v1/qms/lessons', f.quality.session, LESSON));
    const body = { ...LESSON, title: 'Probar siempre antes de entregar' };
    return final(s.patch(`/v1/qms/lessons/${id}`, f.quality.session, body, 1));
  },
  'POST /v1/qms/nonconformities': async (s) => {
    const f = await qualityFixture(s, 'auditoria-nc');
    const body = { description: 'El informe salió sin revisión.', detected_on: today(s) };
    return final(s.post(NC, f.worker.session, body));
  },
  'POST /v1/qms/nonconformities/{id}/actions/contain': async (s) => {
    const f = await qualityFixture(s, 'auditoria-nc-contiene');
    const id = await reported(s, f.worker);
    const body = {
      classification: 'nonconforming_output',
      process_id: await processId(s),
      containment: 'Se retuvo el entregable.',
      contained_on: today(s),
    };
    return final(at(s, `${NC}/${id}/actions/contain`, f.quality, 1, body));
  },
  'POST /v1/qms/nonconformities/{id}/actions/analyze': async (s) => {
    const f = await qualityFixture(s, 'auditoria-nc-analiza');
    const id = await reported(s, f.worker);
    const version = await analyzed(s, f, id);
    const body = {
      analysis: { method: 'five_whys', whys: ['No se probó'] },
      root_cause: 'No hay lista de verificación de entregas.',
    };
    return final(at(s, `${NC}/${id}/actions/analyze`, f.quality, version, body));
  },
  'POST /v1/qms/nonconformities/{id}/actions/plan': async (s) => {
    const f = await qualityFixture(s, 'auditoria-nc-plan');
    const id = await reported(s, f.worker);
    const version = await analyzed(s, f, id);
    const action = actionBody({ type: 'nonconformity', id }, f.worker.id, later(s, 5));
    coded(await s.post('/v1/qms/actions', f.quality.session, action));
    return final(at(s, `${NC}/${id}/actions/plan`, f.quality, version));
  },
  'POST /v1/qms/nonconformities/{id}/actions/close': async (s) => {
    const f = await qualityFixture(s, 'auditoria-nc-cierra');
    const id = await verifiedNonconformity(s, f);
    return final(at(s, `${NC}/${id}/actions/close`, f.director, 5, { note: null }));
  },
  'POST /v1/qms/nonconformities/{id}/actions/reopen': async (s) => {
    const f = await qualityFixture(s, 'auditoria-nc-reabre');
    const id = await verifiedNonconformity(s, f);
    const body = { reason: 'El error volvió a pasar.' };
    return final(at(s, `${NC}/${id}/actions/reopen`, f.director, 5, body));
  },
  'POST /v1/qms/actions': async (s) => {
    const f = await qualityFixture(s, 'auditoria-accion');
    const body = actionBody({ type: 'improvement', id: null }, f.worker.id, later(s, 5));
    return final(s.post('/v1/qms/actions', f.quality.session, body));
  },
  'POST /v1/qms/actions/export': async (s) => {
    const f = await qualityFixture(s, 'auditoria-bitacora');
    return final(s.post('/v1/qms/actions/export', f.auditor.session));
  },
  'PATCH /v1/qms/actions/{id}': async (s) => {
    const f = await qualityFixture(s, 'auditoria-accion-cambio');
    const body = actionBody({ type: 'improvement', id: null }, f.worker.id, later(s, 5));
    const { id } = coded(await s.post('/v1/qms/actions', f.quality.session, body));
    const edit = {
      description: body.description,
      responsible_id: f.verifier.id,
      due_on: body.due_on,
      notes: null,
    };
    return final(s.patch(`/v1/qms/actions/${id}`, f.quality.session, edit, 1));
  },
  'POST /v1/qms/actions/{id}/actions/execute': async (s) => {
    const f = await qualityFixture(s, 'auditoria-accion-ejecuta');
    const { actionId } = await plannedNonconformity(s, f);
    return final(executed(s, f.worker, actionId));
  },
  'POST /v1/qms/actions/{id}/actions/verify': async (s) => {
    const f = await qualityFixture(s, 'auditoria-accion-verifica');
    const { actionId } = await plannedNonconformity(s, f);
    await executed(s, f.worker, actionId);
    const path = `/v1/qms/actions/${actionId}/actions/verify`;
    return final(at(s, path, f.verifier, 2, verification(s, true)));
  },
};

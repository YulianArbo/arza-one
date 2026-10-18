import { changeRequestSchema } from '@arza/contracts';
import type request from 'supertest';
import { expect } from 'vitest';

import type { AccessScenario } from '../../iam/support/access-scenario.js';
import { code, created, quality, seeded, versionAt } from './doc-sgc-steps.js';

// Llamadas del recorrido de escrituras (B11) para el control documental (B19): la Solicitud de
// Acción Documental y sus pasos, y la constancia de lectura.

interface PendingRequest {
  readonly test: request.Test;
}

type RouteCall = (scenario: AccessScenario) => Promise<PendingRequest>;

async function filedRequest(s: AccessScenario) {
  await seeded(s);
  const requester = await quality(s, 'pide-recorrido');
  const body = {
    action: 'create',
    document_id: null,
    doc_type: 'PR',
    process_id: await code(s, 'orgUnit', 'SGC'),
    title: 'Procedimiento nuevo',
    justification: 'El proceso necesita este procedimiento.',
  };
  return created(s.post('/v1/change-requests', requester.session, body));
}

async function requestVersion(s: AccessScenario, id: string): Promise<number> {
  const decider = await quality(s, 'decide-recorrido');
  const response = await s.get(`/v1/change-requests/${id}`, decider.session);
  expect(response.status, response.text).toBe(200);
  return changeRequestSchema.parse(response.body).version;
}

const SGC_STEPS = ['submit', 'review', 'approve', 'publish'] as const;

export const DOC_REQUEST_ROUTE_CALLS: Record<string, RouteCall> = {
  'POST /v1/change-requests': async (s) => {
    await seeded(s);
    const person = await quality(s);
    const body = {
      action: 'create',
      document_id: null,
      doc_type: 'PL',
      process_id: await code(s, 'orgUnit', 'COM'),
      title: 'Plan comercial',
      justification: 'El proceso comercial necesita su plan anual.',
    };
    return { test: s.post('/v1/change-requests', person.session, body) };
  },
  'POST /v1/change-requests/{id}/actions/{step}': async (s) => {
    const id = await filedRequest(s);
    const version = await requestVersion(s, id);
    const decider = await quality(s, 'decide-recorrido');
    return {
      test: s
        .post(`/v1/change-requests/${id}/actions/analyze`, decider.session, {})
        .set('If-Match', `"${String(version)}"`),
    };
  },
  'POST /v1/master-list/export': async (s) => {
    await seeded(s);
    const person = await quality(s);
    return { test: s.post('/v1/master-list/export', person.session, {}) };
  },
  'POST /v1/documents/{id}/acknowledgements/mine': async (s) => {
    const { author, id } = await versionAt(s, SGC_STEPS);
    return { test: s.post(`/v1/documents/${id}/acknowledgements/mine`, author.session) };
  },
  'POST /v1/documents/{id}/acknowledgement-requests': async (s) => {
    const { approver, id } = await versionAt(s, SGC_STEPS);
    return { test: s.post(`/v1/documents/${id}/acknowledgement-requests`, approver.session) };
  },
};

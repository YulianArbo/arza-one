import { contractDetailSchema, contractOptionsSchema } from '@arza/contracts';

import type { AccessScenario } from '../../iam/support/access-scenario.js';
import { organizationBody, uniqueNumber } from '../../party/support/party-scenario.js';
import {
  active,
  amendment,
  amendmentVersion,
  approved,
  approvedAmendment,
  created,
  data,
  day,
  draft,
  inReview,
  obligation,
  people,
  put,
  signedCopy,
  step,
  versioned,
  type PendingRequest,
} from './contract-steps.js';
import { SIGNATURE_ROUTE_CALLS } from './signature-route-calls.js';

// Llamadas del recorrido de escrituras (B11) para Contratos (B24): contratos, obligaciones, otrosíes,
// prórrogas y la biblioteca de cláusulas, y la firma electrónica (B25, en signature-route-calls). Lo
// que cada llamada necesita lo prepara contract-steps.

type RouteCall = (scenario: AccessScenario) => Promise<PendingRequest>;

const CLAUSE = {
  title: 'Cláusula penal',
  body: 'Una pena del 10 % del valor.',
  numbered: true,
  legal_validated: false,
};

export const CONTRACT_ROUTE_CALLS: Record<string, RouteCall> = {
  ...SIGNATURE_ROUTE_CALLS,
  'POST /v1/contracts': async (s) => {
    const { sales } = await people(s);
    const options = contractOptionsSchema.parse(
      (await s.get('/v1/contracts/options', sales.session)).body,
    );
    const party = await created(s.post('/v1/parties', sales.session, organizationBody()));
    const body = {
      template_id: options.templates[0]?.id,
      party_id: party,
      quote_id: null,
      ...data(s),
    };
    return { test: s.post('/v1/contracts', sales.session, body) };
  },
  'PUT /v1/contracts/{id}': async (s) => {
    const { sales } = await people(s);
    const id = await draft(s, sales);
    const detail = contractDetailSchema.parse(
      (await s.get(`/v1/contracts/${id}`, sales.session)).body,
    );
    const clauses = detail.clauses.map((c) => ({
      clause_key: c.clause_key,
      title: c.title,
      body: null,
    }));
    return {
      test: versioned(
        put(s, `/v1/contracts/${id}`, sales, { ...data(s), clauses }),
        detail.version,
      ),
    };
  },
  'POST /v1/contracts/{id}/actions/submit': async (s) => {
    const { sales } = await people(s);
    return step(s, sales, await draft(s, sales), 'submit');
  },
  'POST /v1/contracts/{id}/actions/approve': async (s) => {
    const { director, id } = await inReview(s);
    return step(s, director, id, 'approve');
  },
  'POST /v1/contracts/{id}/actions/return': async (s) => {
    const { director, id } = await inReview(s);
    return step(s, director, id, 'return', { comment: 'Ajuste el valor.' });
  },
  'POST /v1/contracts/{id}/actions/register-signature': async (s) => {
    const { sales, id } = await approved(s);
    const body = { file_id: await signedCopy(s, sales), signed_on: day(s, 0) };
    return step(s, sales, id, 'register-signature', body);
  },
  'POST /v1/contracts/{id}/actions/terminate': async (s) => {
    const { director, id } = await active(s);
    const body = { terminated_on: day(s, 0), reason: 'Mutuo acuerdo.' };
    return step(s, director, id, 'terminate', body);
  },
  'POST /v1/contracts/{id}/actions/renew': async (s) => {
    const { director, id } = await active(s);
    const body = { new_ends_on: day(s, 730), summary: 'Renovación anual' };
    return { test: s.post(`/v1/contracts/${id}/actions/renew`, director.session, body) };
  },
  'POST /v1/contracts/{id}/pdf': async (s) => {
    const { sales, id } = await approved(s);
    return { test: s.post(`/v1/contracts/${id}/pdf`, sales.session, { document: 'generated' }) };
  },
  'POST /v1/contracts/{id}/obligations': async (s) => {
    const { sales } = await people(s);
    const id = await draft(s, sales);
    const body = {
      description: 'Entregar el prototipo',
      responsible_id: sales.id,
      due_on: day(s, 10),
    };
    return { test: s.post(`/v1/contracts/${id}/obligations`, sales.session, body) };
  },
  'PUT /v1/contracts/{id}/obligations/{obligationId}': async (s) => {
    const { sales, body, path } = await obligation(s);
    return { test: versioned(put(s, path, sales, { ...body, due_on: day(s, 20) }), 1) };
  },
  'POST /v1/contracts/{id}/obligations/{obligationId}/actions/complete': async (s) => {
    const { sales, path } = await obligation(s);
    return {
      test: versioned(s.post(`${path}/actions/complete`, sales.session, { note: null }), 1),
    };
  },
  'POST /v1/contracts/{id}/amendments': async (s) => {
    const { sales, id } = await active(s);
    const body = {
      summary: 'Se amplía el alcance',
      body: 'Las partes acuerdan ampliar el alcance del contrato.',
      effective_on: day(s, 0),
      new_ends_on: null,
      new_value: null,
    };
    return { test: s.post(`/v1/contracts/${id}/amendments`, sales.session, body) };
  },
  'POST /v1/contracts/{id}/amendments/{amendmentId}/actions/approve': async (s) => {
    const { sales, director, base, id } = await amendment(s);
    const version = await amendmentVersion(s, sales, id);
    return { test: versioned(s.post(`${base}/actions/approve`, director.session, {}), version) };
  },
  'POST /v1/contracts/{id}/amendments/{amendmentId}/actions/return': async (s) => {
    const { sales, director, base, id } = await amendment(s);
    const body = { comment: 'Precise el alcance.' };
    const version = await amendmentVersion(s, sales, id);
    return { test: versioned(s.post(`${base}/actions/return`, director.session, body), version) };
  },
  'POST /v1/contracts/{id}/amendments/{amendmentId}/actions/register-signature': async (s) => {
    const { sales, base, id } = await approvedAmendment(s);
    const body = { file_id: await signedCopy(s, sales), signed_on: day(s, 0) };
    const version = await amendmentVersion(s, sales, id);
    return {
      test: versioned(s.post(`${base}/actions/register-signature`, sales.session, body), version),
    };
  },
  'POST /v1/contracts/{id}/amendments/{amendmentId}/pdf': async (s) => {
    const { sales, base } = await approvedAmendment(s);
    return { test: s.post(`${base}/pdf`, sales.session, { document: 'generated' }) };
  },
  'POST /v1/contract-clauses': async (s) => {
    const { director } = await people(s);
    const body = { ...CLAUSE, key: `penal-${uniqueNumber()}` };
    return { test: s.post('/v1/contract-clauses', director.session, body) };
  },
  'POST /v1/contract-clauses/{key}/versions': async (s) => {
    const { director } = await people(s);
    const path = `/v1/contract-clauses/garantia/versions`;
    return { test: s.post(path, director.session, { ...CLAUSE, title: 'Garantía' }) };
  },
};

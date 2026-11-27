import type { AccessScenario } from '../../iam/support/access-scenario.js';
import {
  answerOf,
  assist,
  createdId,
  enable,
  putAs,
  useCaseVersion,
  ASSESSMENT,
} from '../../ai/support/ai-fixture.js';
import { created, type PendingRequest } from './contract-steps.js';
import type { RouteCall } from './project-route-calls.js';

// Rutas del asistente de IA (B47) que escriben, para el recorrido de auditoría: cada uso queda en
// la auditoría (ai.request.create), igual que la activación de un uso y las instrucciones.

const TICKET = {
  subject: 'El tablero no abre',
  description: 'Al entrar al tablero aparece un error y no carga.',
  category: 'incident',
  priority: 'high',
};

function final(test: PendingRequest['test']): PendingRequest {
  return { test };
}

/** Un tiquete y su resumen ya pedido al asistente, a nombre de Servicio al cliente. */
async function summarized(s: AccessScenario) {
  const officer = await s.person('oficial-recorrido-ia', ['OFICIAL_DATOS']);
  await enable(s, officer, ['ticket_summary']);
  const agent = await s.person('servicio-recorrido-ia', ['SERVICIO']);
  const ticket = await created(s.post('/v1/tickets', agent.session, TICKET));
  return { agent, ticket };
}

export const AI_ROUTE_CALLS: Readonly<Record<string, RouteCall>> = {
  'POST /v1/ai/search': async (s) => {
    const officer = await s.person('oficial-busqueda-ia', ['OFICIAL_DATOS']);
    await enable(s, officer, ['doc_search']);
    const worker = await s.person('colaborador-busqueda-ia', ['COLABORADOR']);
    return final(s.post('/v1/ai/search', worker.session, { question: '¿Cómo pido vacaciones?' }));
  },
  'POST /v1/ai/assist': async (s) => {
    const { agent, ticket } = await summarized(s);
    return final(assist(s, agent, 'ticket_summary', ticket));
  },
  'POST /v1/ai/requests/{id}/review': async (s) => {
    const { agent, ticket } = await summarized(s);
    const answer = answerOf(await assist(s, agent, 'ticket_summary', ticket));
    const path = `/v1/ai/requests/${answer.request_id}/review`;
    return final(s.post(path, agent.session, { decision: 'accepted' }));
  },
  'PUT /v1/ai/use-cases/{useCase}': async (s) => {
    const officer = await s.person('oficial-uso-ia', ['OFICIAL_DATOS']);
    const version = await useCaseVersion(s, officer, 'pqrsf_reply');
    const body = { enabled: true, ...ASSESSMENT, version };
    return final(putAs(s, '/v1/ai/use-cases/pqrsf_reply', officer, body));
  },
  'POST /v1/ai/prompts': async (s) => {
    const admin = await s.person('admin-instruccion-ia', ['ADMIN_PLATAFORMA']);
    const body = {
      use_case: 'ticket_reply',
      body: 'Responda con cortesía y en no más de cinco líneas.',
    };
    return final(s.post('/v1/ai/prompts', admin.session, body));
  },
  'POST /v1/ai/prompts/{id}/approve': async (s) => {
    const admin = await s.person('admin-propone-ia', ['ADMIN_PLATAFORMA']);
    const quality = await s.person('calidad-aprueba-ia', ['CALIDAD']);
    const body = {
      use_case: 'ticket_summary',
      body: 'Resuma en cinco viñetas lo pedido y lo pendiente.',
    };
    const id = createdId(await s.post('/v1/ai/prompts', admin.session, body));
    return final(s.post(`/v1/ai/prompts/${id}/approve`, quality.session));
  },
};

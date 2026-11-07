// Datos ficticios de las pruebas de PQRSF, encuestas y base de conocimiento (B29).

import type {
  KbArticleDetail,
  KbArticleSummary,
  PermissionCode,
  PqrsfDetail,
  PqrsfSummary,
  Survey,
  SurveyResults,
} from '@arza/contracts';

import { SESSION, json, mockApi, type SentRequest } from './fake-api';

type Handler = Parameters<typeof mockApi>[0][string];
type Routes = Record<string, Handler>;

export const PQRSF_ID = '01999a00-0000-7000-8000-0000000f9001';
export const SURVEY_ID = '01999a00-0000-7000-8000-0000000f9101';
export const ARTICLE_ID = '01999a00-0000-7000-8000-0000000f9201';
const ME = { id: SESSION.user.id, name: 'Lucía Servicio' };
export const OTHER = { id: '01999a00-0000-7000-8000-00000000a009', name: 'Tomás Soporte' };

function grantsOf(codes: readonly PermissionCode[]): object {
  return {
    roles: [{ id: '01999a00-0000-7000-8000-00000000c030', code: 'SERVICIO', name: 'Servicio' }],
    permissions: codes.map((code) => ({ code, scope: 'all' })),
  };
}

export const CARE_AGENT = grantsOf([
  'service.ticket.read',
  'service.pqrsf.read',
  'service.pqrsf.classify',
  'service.pqrsf.respond',
  'service.pqrsf.approve',
  'service.survey.manage',
  'service.kb.read',
  'service.kb.manage',
]);

/** Solo lee PQRSF, como el Oficial de protección de datos. */
export const PQRSF_READER = grantsOf(['service.pqrsf.read', 'service.kb.read']);

/** Solo lee la base de conocimiento, como el Contador. */
export const KB_READER = grantsOf(['service.kb.read']);

const SUMMARY: PqrsfSummary = {
  id: PQRSF_ID,
  code: 'PQRSF-2026-0001',
  type: 'complaint',
  privacy_kind: null,
  status: 'filed',
  approval: 'none',
  channel: 'web',
  requester_name: 'Ana Pérez',
  subject: 'Demora en la entrega',
  party: null,
  assignee: null,
  received_at: '2026-11-06T15:00:00.000Z',
  due_on: '2026-11-27',
  due_state: 'on_time',
};

const NONE = { classify: false, assign: false, draft: false, approve: false, close: false };

export function pqrsfDetail(overrides: Partial<PqrsfDetail> = {}): PqrsfDetail {
  return {
    ...SUMMARY,
    description: 'El entregable del portal llegó dos semanas tarde.',
    requester_email: 'ana@ejemplo.test',
    requester_phone: null,
    term_days: 15,
    warn_on: '2026-11-25',
    response_draft: null,
    well_founded: null,
    drafted_by: null,
    submitted_at: null,
    return_reason: null,
    response: null,
    approved_by: null,
    responded_at: null,
    transferred_at: null,
    nonconformity_at: null,
    ack_sent_at: '2026-11-06T15:01:00.000Z',
    response_sent_at: null,
    closed_at: null,
    created_by: null,
    version: 2,
    can: { ...NONE, classify: true },
    ...overrides,
  };
}

/** En trámite, con borrador de otra persona y por aprobar. */
export const PENDING = pqrsfDetail({
  status: 'in_progress',
  approval: 'pending',
  assignee: OTHER,
  response_draft: 'Ajustamos el cronograma de entregas.',
  well_founded: true,
  drafted_by: OTHER,
  submitted_at: '2026-11-07T15:00:00.000Z',
  can: { ...NONE, assign: true, approve: true },
});

const SURVEY: Survey = {
  id: SURVEY_ID,
  key: 'ticket_resolution',
  name: 'Satisfacción con la atención',
  trigger: 'ticket_resolved',
  recommend_question: 'Del 0 al 10, ¿qué tan probable es que nos recomiende?',
  satisfaction_question: 'Del 1 al 5, ¿qué tan satisfecho quedó?',
  comment_question: '¿Quiere contarnos algo más? (opcional)',
  is_active: true,
  version: 1,
};

export const RESULTS: SurveyResults = {
  from: '2026-08-09',
  to: '2026-11-07',
  summary: {
    sent: 4,
    answered: 3,
    nps: 33,
    promoters: 2,
    passives: 0,
    detractors: 1,
    satisfaction_avg: 4.3,
  },
  data: [
    {
      id: '01999a00-0000-7000-8000-0000000f9102',
      ticket: { id: '01999a00-0000-7000-8000-0000000f8001', code: 'TIQ-2026-0001' },
      party: { id: '01999a00-0000-7000-8000-0000000f9103', name: 'Comercializadora Andina S.A.S.' },
      score: 10,
      satisfaction: 5,
      comment: 'Muy buena atención.',
      answered_at: '2026-11-06T18:00:00.000Z',
    },
    {
      id: '01999a00-0000-7000-8000-0000000f9104',
      ticket: { id: '01999a00-0000-7000-8000-0000000f8002', code: 'TIQ-2026-0002' },
      party: null,
      score: 4,
      satisfaction: 3,
      comment: null,
      answered_at: '2026-11-05T18:00:00.000Z',
    },
  ],
};

const ARTICLE: KbArticleSummary = {
  id: ARTICLE_ID,
  title: 'Cómo restablecer su contraseña',
  summary: 'Pasos para recuperar el acceso a ARZA ONE si olvidó su contraseña.',
  category: 'platform',
  audience: 'internal',
  status: 'draft',
  published_at: null,
  updated_at: '2026-11-06T15:00:00.000Z',
};

export function articleDetail(overrides: Partial<KbArticleDetail> = {}): KbArticleDetail {
  return {
    ...ARTICLE,
    body: 'Abra la página de ingreso.\n\n- Elija «¿Olvidó su contraseña?».\n- Revise su correo.',
    author: ME,
    version: 1,
    can: { edit: true, publish: true, archive: true },
    ...overrides,
  };
}

export function serveCare(permissions: object, extra: Routes = {}): SentRequest[] {
  return mockApi({
    'GET /v1/auth/session': () => json(SESSION),
    'GET /v1/me/permissions': () => json(permissions),
    'GET /v1/pqrsf': () => json({ data: [SUMMARY], next_cursor: null, can_create: true }),
    'GET /v1/pqrsf/options': () => json({ assignees: [ME, OTHER] }),
    [`GET /v1/pqrsf/${PQRSF_ID}`]: () => json(pqrsfDetail()),
    'GET /v1/surveys': () => json({ data: [SURVEY], can_manage: true }),
    'GET /v1/survey-responses': () => json(RESULTS),
    'GET /v1/kb-articles': () => json({ data: [ARTICLE], next_cursor: null, can_manage: true }),
    [`GET /v1/kb-articles/${ARTICLE_ID}`]: () => json(articleDetail()),
    'GET /v1/tickets': () => json({ data: [], next_cursor: null }),
    ...extra,
  });
}

/** La ficha de la PQRSF con lo que se pida. */
export function pqrsfRoute(detail: PqrsfDetail): Routes {
  return { [`GET /v1/pqrsf/${PQRSF_ID}`]: () => json(detail) };
}

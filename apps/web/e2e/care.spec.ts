import { mockApi, type ApiRoutes } from './support/api-mock';
import { accessibilityViolations, expect, test, useTheme } from './support/fixtures';

// PQRSF, encuestas y base de conocimiento (B29): bandeja y ficha de la PQRSF, registro interno,
// encuestas y NPS, base de conocimiento y las páginas públicas (radicar, consultar, encuesta), sin
// violaciones de accesibilidad WCAG 2.2 AA en modo claro y oscuro. Datos ficticios.

const PQRSF = '01999a00-0000-7000-8000-0000000f9001';
const ARTICLE = '01999a00-0000-7000-8000-0000000f9201';
const TOKEN = 'C'.repeat(43);
const AGENT = { id: '01999a00-0000-7000-8000-00000000a009', name: 'Tomás Soporte' };

const SUMMARY = {
  id: PQRSF,
  code: 'PQRSF-2026-0001',
  type: 'complaint',
  privacy_kind: null,
  status: 'in_progress',
  approval: 'pending',
  channel: 'web',
  requester_name: 'Ana Pérez',
  subject: 'Demora en la entrega',
  party: null,
  assignee: AGENT,
  received_at: '2026-11-06T15:00:00.000Z',
  due_on: '2026-11-27',
  due_state: 'at_risk',
};

const DETAIL = {
  ...SUMMARY,
  description: 'El entregable del portal llegó dos semanas tarde.',
  requester_email: 'ana@ejemplo.test',
  requester_phone: null,
  term_days: 15,
  warn_on: '2026-11-25',
  response_draft: 'Ajustamos el cronograma de entregas.',
  well_founded: true,
  drafted_by: AGENT,
  submitted_at: '2026-11-07T15:00:00.000Z',
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
  version: 3,
  can: { classify: false, assign: true, draft: false, approve: true, close: false },
};

const SURVEY = {
  id: '01999a00-0000-7000-8000-0000000f9101',
  key: 'ticket_resolution',
  name: 'Satisfacción con la atención',
  trigger: 'ticket_resolved',
  recommend_question: 'Del 0 al 10, ¿qué tan probable es que nos recomiende?',
  satisfaction_question: 'Del 1 al 5, ¿qué tan satisfecho quedó con la solución?',
  comment_question: '¿Quiere contarnos algo más? (opcional)',
  is_active: true,
  version: 1,
};

const RESULTS = {
  from: '2026-08-09',
  to: '2026-11-07',
  summary: {
    sent: 2,
    answered: 1,
    nps: 100,
    promoters: 1,
    passives: 0,
    detractors: 0,
    satisfaction_avg: 5,
  },
  data: [
    {
      id: '01999a00-0000-7000-8000-0000000f9102',
      ticket: { id: '01999a00-0000-7000-8000-0000000f8001', code: 'TIQ-2026-0001' },
      party: null,
      score: 10,
      satisfaction: 5,
      comment: 'Muy buena atención.',
      answered_at: '2026-11-06T18:00:00.000Z',
    },
  ],
};

const ARTICLE_SUMMARY = {
  id: ARTICLE,
  title: 'Cómo restablecer su contraseña',
  summary: 'Pasos para recuperar el acceso a ARZA ONE si olvidó su contraseña.',
  category: 'platform',
  audience: 'internal',
  status: 'published',
  published_at: '2026-11-06T15:00:00.000Z',
  updated_at: '2026-11-06T15:00:00.000Z',
};

const API: ApiRoutes = {
  '/v1/pqrsf': { body: { data: [SUMMARY], next_cursor: null, can_create: true } },
  '/v1/pqrsf/options': { body: { assignees: [AGENT] } },
  [`/v1/pqrsf/${PQRSF}`]: { body: DETAIL },
  '/v1/surveys': { body: { data: [SURVEY], can_manage: true } },
  '/v1/survey-responses': { body: RESULTS },
  '/v1/kb-articles': { body: { data: [ARTICLE_SUMMARY], next_cursor: null, can_manage: true } },
  [`/v1/kb-articles/${ARTICLE}`]: {
    body: {
      ...ARTICLE_SUMMARY,
      body: 'Abra la página de ingreso.\n\n- Elija «¿Olvidó su contraseña?».\n- Revise su correo.',
      author: AGENT,
      version: 2,
      can: { edit: true, publish: false, archive: true },
    },
  },
  '/v1/tickets': { body: { data: [], next_cursor: null } },
  '/v1/public/surveys/view': {
    body: {
      state: 'open',
      company: 'ARZA TECH S.A.S.',
      ticket_code: 'TIQ-2026-0001',
      ticket_subject: 'No carga el reporte de ventas',
      recommend_question: SURVEY.recommend_question,
      satisfaction_question: SURVEY.satisfaction_question,
      comment_question: SURVEY.comment_question,
    },
  },
  '/v1/public/pqrsf': {
    status: 201,
    body: {
      code: 'PQRSF-2026-0007',
      type: 'petition',
      received_at: '2026-11-07T15:00:00.000Z',
      due_on: '2026-11-30',
    },
  },
};

const PAGES = [
  { path: '/app/servicio/pqrsf', ready: 'PQRSF-2026-0001', name: 'la bandeja de PQRSF' },
  { path: `/app/servicio/pqrsf/${PQRSF}`, ready: 'Borrador de respuesta', name: 'la ficha' },
  { path: '/app/servicio/pqrsf/nueva', ready: 'Registrar la PQRSF', name: 'el registro' },
  { path: '/app/servicio/encuestas', ready: 'Muy buena atención.', name: 'las encuestas' },
  {
    path: '/app/servicio/conocimiento',
    ready: 'Cómo restablecer su contraseña',
    name: 'la base de conocimiento',
  },
  {
    path: `/app/servicio/conocimiento/${ARTICLE}`,
    ready: 'Abra la página de ingreso.',
    name: 'un artículo',
  },
  { path: '/pqrsf', ready: 'Radicar una PQRSF', name: 'el formulario público' },
  { path: '/pqrsf/consulta', ready: 'Consultar una PQRSF', name: 'la consulta pública' },
  { path: `/encuesta#token=${TOKEN}`, ready: 'No carga el reporte de ventas', name: 'la encuesta' },
] as const;

for (const theme of ['light', 'dark'] as const) {
  test.describe(`PQRSF y encuestas en modo ${theme === 'light' ? 'claro' : 'oscuro'}`, () => {
    test.slow();
    for (const page of PAGES) {
      test(`${page.name} no tiene violaciones de accesibilidad`, async ({
        page: browser,
        consoleErrors,
      }) => {
        await useTheme(browser, theme);
        await mockApi(browser, API);
        await browser.goto(page.path);
        await expect(browser.getByText(page.ready, { exact: true }).first()).toBeVisible();
        expect(await accessibilityViolations(browser)).toEqual([]);
        expect(consoleErrors).toEqual([]);
      });
    }
  });
}

test('radicar en el sitio muestra el radicado y la fecha límite', async ({
  page,
  consoleErrors,
}) => {
  await mockApi(page, API);
  await page.goto('/pqrsf');
  await page.getByLabel('Nombre completo').fill('Ana Pérez');
  await page.getByLabel('Correo', { exact: true }).fill('ana@ejemplo.test');
  await page.getByLabel('Asunto').fill('Horario de atención');
  await page.getByLabel(/qué pasó/u).fill('Quisiera atención los sábados.');
  await page.getByRole('checkbox').check();
  await page.getByRole('button', { name: 'Radicar' }).click();
  await expect(page.getByText('PQRSF-2026-0007')).toBeVisible();
  await expect(page.getByText(/30\/11\/2026/u)).toBeVisible();
  expect(consoleErrors).toEqual([]);
});

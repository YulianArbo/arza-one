// Datos ficticios de las pruebas de las pantallas de Proyectos (B26). Ninguno es real.

import type { PermissionCode } from '@arza/contracts';

import { SESSION, json, mockApi, type SentRequest } from './fake-api';
import { ORG_ID, permissionsOf } from './party-fixtures';

export const PROJECT_ID = '01999a00-0000-7000-8000-0000000e0001';
export const CONTRACT_ID = '01999a00-0000-7000-8000-0000000d0001';
export const SPRINT_ID = '01999a00-0000-7000-8000-0000000e0101';
export const ITEM_ID = '01999a00-0000-7000-8000-0000000e0201';
const STORY_ID = '01999a00-0000-7000-8000-0000000e0202';
const EPIC_ID = '01999a00-0000-7000-8000-0000000e0203';
const MEMBER_ID = '01999a00-0000-7000-8000-0000000e0301';
const LEADER = { id: SESSION.user.id, name: 'Ana Pérez' };
const DEVELOPER = { id: '01999a00-0000-7000-8000-00000000a003', name: 'Carlos Ruiz' };
export const TESTER = { id: '01999a00-0000-7000-8000-00000000a004', name: 'Marta Prueba' };

const LEAD: readonly PermissionCode[] = [
  'party.read',
  'project.read_all',
  'project.read_member',
  'project.create',
  'project.update',
  'project.member.manage',
  'project.item.manage',
];

export const PROJECT_LEADER = permissionsOf(LEAD);
export const PROJECT_MEMBER = permissionsOf(['project.read_member', 'project.item.manage']);
export const PROJECT_READER = permissionsOf(['project.read_all', 'project.read_member']);

const SUMMARY = {
  id: PROJECT_ID,
  code: 'PRY-2026-0001',
  name: 'Portal de clientes',
  party: { id: ORG_ID, name: 'Comercializadora Andina S.A.S.' },
  contract: { id: CONTRACT_ID, code: 'CTR-2026-0001', title: 'Portal de clientes' },
  status: 'in_progress',
  starts_on: '2026-11-01',
  ends_on: '2027-02-28',
  manager: LEADER,
  progress: { planned: 2, done: 1, percent: 50 },
  version: 3,
} as const;

const SPRINT = {
  id: SPRINT_ID,
  name: 'Iteración 1',
  starts_on: '2026-11-02',
  ends_on: '2026-11-15',
  goal: 'Consulta de facturas',
  status: 'active',
  items: 2,
  version: 2,
} as const;

const MEMBERS = [
  { id: MEMBER_ID, person: LEADER, role: 'leader', allocation_pct: 100, version: 1 },
  {
    id: '01999a00-0000-7000-8000-0000000e0302',
    person: DEVELOPER,
    role: 'development',
    allocation_pct: 50,
    version: 1,
  },
];

const MILESTONES = [
  {
    id: '01999a00-0000-7000-8000-0000000e0401',
    name: 'Anticipo',
    due_on: '2026-11-15',
    billing_pct: 30,
    status: 'pending',
    version: 1,
  },
];

const CAN_ALL = { update: true, manage_members: true, manage_items: true };

/** Ficha de un proyecto; por omisión, en ejecución desde un contrato vigente. */
function projectDetail(overrides: object = {}): object {
  return {
    ...SUMMARY,
    type: 'development',
    methodology: 'scrum',
    description: null,
    budget_hours: 480.5,
    budget_amount: '12000000.00',
    status_reason: null,
    contract_status: 'active',
    authorization: { status: 'none', reason: null, note: null, decided_by: null, decided_at: null },
    started_at: '2026-11-01T14:00:00.000Z',
    created_at: '2026-10-31T15:00:00.000Z',
    members: MEMBERS,
    milestones: MILESTONES,
    sprints: [SPRINT],
    links: [
      {
        id: '01999a00-0000-7000-8000-0000000e0501',
        kind: 'repository',
        url: 'https://git.example.com/portal',
        label: 'Repositorio del portal',
      },
    ],
    can: CAN_ALL,
    ...overrides,
  };
}

function item(overrides: object = {}): object {
  return {
    id: ITEM_ID,
    number: 2,
    code: 'PRY-2026-0001-2',
    type: 'story',
    parent: { id: EPIC_ID, number: 1, title: 'Facturación' },
    title: 'Consultar facturas',
    description: null,
    acceptance_criteria: 'Ve sus facturas del último año.',
    status: 'in_testing',
    priority: 'high',
    estimate_hours: 8,
    assignee: DEVELOPER,
    sprint_id: SPRINT_ID,
    review_url: null,
    test_note: null,
    done_at: null,
    version: 4,
    ...overrides,
  };
}

const ITEMS = [
  item({
    id: EPIC_ID,
    number: 1,
    code: 'PRY-2026-0001-1',
    type: 'epic',
    parent: null,
    title: 'Facturación',
    status: 'pending',
    sprint_id: null,
    acceptance_criteria: null,
  }),
  item(),
  item({
    id: STORY_ID,
    number: 3,
    code: 'PRY-2026-0001-3',
    title: 'Descargar facturas',
    acceptance_criteria: null,
    status: 'pending',
    sprint_id: null,
  }),
];

const OPTIONS = {
  contracts: [
    {
      id: CONTRACT_ID,
      code: 'CTR-2026-0002',
      title: 'Soporte anual',
      party: { id: ORG_ID, name: 'Comercializadora Andina S.A.S.' },
      starts_on: '2026-11-01',
      ends_on: '2027-10-31',
      value: '24000000.00',
    },
  ],
  people: [LEADER, DEVELOPER, TESTER],
};

type Routes = Parameters<typeof mockApi>[0];

export function serveProjects(permissions: object, extra: Routes = {}): SentRequest[] {
  return mockApi({
    'GET /v1/auth/session': () => json(SESSION),
    'GET /v1/me/permissions': () => json(permissions),
    'GET /v1/projects': () => json({ data: [SUMMARY], next_cursor: null }),
    'GET /v1/projects/options': () => json(OPTIONS),
    [`GET /v1/projects/${PROJECT_ID}`]: () => json(projectDetail()),
    [`GET /v1/projects/${PROJECT_ID}/items`]: () => json({ data: ITEMS }),
    [`GET /v1/projects/${PROJECT_ID}/board`]: () =>
      json({ sprint: SPRINT, items: ITEMS.slice(1, 2), refreshed_at: '2026-11-05T15:00:00.000Z' }),
    'GET /v1/parties': () => json({ data: [], next_cursor: null }),
    ...extra,
  });
}

/** La ficha del proyecto con lo que se pida. */
export function detailRoute(overrides: object): Routes {
  return { [`GET /v1/projects/${PROJECT_ID}`]: () => json(projectDetail(overrides)) };
}

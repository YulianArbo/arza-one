// Datos ficticios de las pruebas de las pantallas de Proyectos (B26 y B27). Ninguno es real.

import type { PermissionCode } from '@arza/contracts';

import { SESSION, json, mockApi, type SentRequest } from './fake-api';
import { ORG_ID, permissionsOf } from './party-fixtures';
import { controlRoutes } from './project-control-fixtures';
import {
  CONTRACT_ID,
  DEVELOPER,
  EPIC_ID,
  ITEM_ID,
  LEADER,
  MEMBER_ID,
  PROJECT_ID,
  SPRINT_ID,
  STORY_ID,
  TESTER,
} from './project-ids';

export { CONTRACT_ID, ITEM_ID, PROJECT_ID, SPRINT_ID, TESTER } from './project-ids';
export * from './project-control-fixtures';

const LEAD: readonly PermissionCode[] = [
  'party.read',
  'project.read_all',
  'project.read_member',
  'project.create',
  'project.update',
  'project.member.manage',
  'project.item.manage',
  'project.time.log',
  'project.time.approve',
  'project.deliverable.submit',
  'project.release.manage',
  'project.incident.manage',
  'project.close',
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

const CAN_ALL = {
  update: true,
  manage_members: true,
  manage_items: true,
  log_time: true,
  approve_time: true,
  deliver: true,
  manage_releases: true,
  manage_incidents: true,
  close: true,
  see_money: true,
};

/** Lo que puede quien solo lee el proyecto (B27). */
export const CAN_NOTHING = Object.fromEntries(Object.keys(CAN_ALL).map((key) => [key, false]));

const CONTROL = {
  hour_cost: '45000.00',
  respond_days: 10,
  tacit_acceptance: false,
  tacit_clause: null,
  closing_note: null,
  closed_at: null,
};

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
    control: CONTROL,
    can: CAN_ALL,
    ...overrides,
  };
}

/** Un ítem de la lista; por omisión, una historia en pruebas. */
export function projectItem(overrides: object = {}): object {
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
    last_review: null,
    done_at: null,
    version: 4,
    ...overrides,
  };
}

const ITEMS = [
  projectItem({
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
  projectItem(),
  projectItem({
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
    ...controlRoutes(),
    ...extra,
  });
}

/** La ficha del proyecto con lo que se pida. */
export function detailRoute(overrides: object): Routes {
  return { [`GET /v1/projects/${PROJECT_ID}`]: () => json(projectDetail(overrides)) };
}

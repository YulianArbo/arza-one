import type {
  LeaveRequest,
  MySpace,
  Offboarding,
  Overtime,
  PayrollNovelty,
  PayrollPeriod,
  PerformanceReview,
  Training,
} from '@arza/contracts';

// Datos ficticios de las pantallas del B36: un colaborador, su jefe y sus solicitudes.

export const B36_ID = (n: number): string =>
  `01999a00-0000-7000-8000-0000000b36${String(n).padStart(2, '0')}`;

const ANA = { id: B36_ID(1), name: 'Ana Prueba' };
const JEFE = { id: B36_ID(2), name: 'Jefe Prueba' };

export const MY_SPACE: MySpace = {
  employment: {
    employee_id: B36_ID(1),
    name: 'Ana Prueba',
    position: { id: B36_ID(3), name: 'Analista' },
    hire_date: '2025-11-19',
    contract_type: 'indefinite',
    work_mode: 'on_site',
    salary_band_label: 'Banda 2',
    contract_available: true,
    manager: JEFE,
    vacation: { accrued: '15.04', used: 2, available: '13.04', days_per_year: 15 },
    has_team: true,
  },
};

export const LEAVE: LeaveRequest = {
  id: B36_ID(10),
  employee: ANA,
  type: 'VACACIONES',
  type_label: 'Vacaciones',
  starts_on: '2026-12-14',
  ends_on: '2026-12-18',
  days: 5,
  status: 'requested',
  note: null,
  approver: JEFE,
  decided_by: null,
  decided_on: null,
  decision_note: null,
  support_file_id: null,
  can_decide: true,
  version: 1,
};

export const OVERTIME: Overtime = {
  id: B36_ID(11),
  employee: ANA,
  work_date: '2026-11-18',
  kind: 'night',
  hours: 2,
  reported_hours: null,
  reason: 'Despliegue nocturno',
  status: 'authorized',
  approver: JEFE,
  authorized_by: JEFE,
  decision_note: null,
  can_decide: false,
  version: 2,
};

export const REVIEW: PerformanceReview = {
  id: B36_ID(12),
  employee: ANA,
  period: '2026',
  objectives: [
    { title: 'Entregar a tiempo', weight: 60, score: 5 },
    { title: 'Documentar', weight: 40, score: 3 },
  ],
  score: '4.20',
  status: 'scored',
  reviewer: JEFE,
  reviewer_comment: 'Buen año.',
  employee_comment: null,
  agreed_on: null,
  can_score: false,
  can_agree: true,
  version: 2,
};

export const TRAINING: Training = {
  id: B36_ID(13),
  code: 'FOR-2026-0001',
  title: 'Pausas activas',
  kind: 'wellbeing',
  scheduled_on: '2026-11-10',
  hours: 1,
  facilitator: null,
  description: null,
  status: 'scheduled',
  evidence_file_id: null,
  attendees: [{ employee: ANA, attended: null, evaluation: null, version: 1 }],
  version: 1,
};

export const NOVELTY: PayrollNovelty = {
  id: B36_ID(14),
  period: '2026-11',
  employee: ANA,
  concept: 'BONIFICACION',
  concept_label: 'Bonificación',
  quantity: '1.00',
  unit: 'units',
  amount: '250000.00',
  starts_on: null,
  ends_on: null,
  source: 'manual',
  note: null,
  version: 1,
};

export const OPEN_PERIOD: PayrollPeriod = {
  period: '2026-11',
  status: 'open',
  novelties: 1,
  closed_on: null,
  closed_by: null,
};

export const OFFBOARDING: Offboarding = {
  id: B36_ID(15),
  employee: ANA,
  reason: 'resignation',
  last_day: '2026-11-18',
  note: null,
  status: 'in_progress',
  checklist: [
    {
      item: 'settlement',
      label: 'Liquidación enviada al software de nómina',
      responsible: JEFE,
      done_on: '2026-11-18',
      done_by: JEFE,
      note: null,
    },
  ],
  assets: [],
  exit_interview_file_id: null,
  account_deactivated_at: '2026-11-19T05:05:00.000Z',
  cleared_on: null,
  can_clear: true,
  version: 3,
};

import type {
  Complaint,
  Hazard,
  Inspection,
  MedicalExam,
  MedicalExamSummary,
  MySst,
  PpeDelivery,
  SstIncidentDetail,
  StandardItem,
  UnsafeReport,
  WorkPlanItem,
} from '@arza/contracts';

// Datos ficticios de las pantallas de SST (B37).

export const SST_ID = (n: number): string =>
  `01999a00-0000-7000-8000-0000000b37${String(n).padStart(2, '0')}`;

export const ANA = { id: SST_ID(1), name: 'Ana Prueba' };
export const LUIS = { id: SST_ID(2), name: 'Luis Lider' };

export const ACCIDENT: SstIncidentDetail = {
  id: SST_ID(10),
  code: 'SST-2026-0001',
  kind: 'accident',
  status: 'reported',
  occurred_at: '2026-11-18T14:00:00.000Z',
  location: 'Escalera piso 2',
  affected: 'self',
  affected_employee: ANA,
  reported_by: ANA,
  arl_due_on: '2026-11-20',
  arl_reported_on: null,
  arl_overdue: true,
  version: 1,
  description: 'Se resbaló en la escalera.',
  photo_file_id: null,
  arl_filing_number: null,
  team: null,
  immediate_causes: null,
  root_causes: null,
  conclusion: null,
  actions: [],
};

export const INVESTIGATING: SstIncidentDetail = {
  ...ACCIDENT,
  id: SST_ID(11),
  code: 'SST-2026-0002',
  kind: 'incident',
  status: 'investigating',
  arl_due_on: null,
  arl_overdue: false,
  affected: 'none',
  affected_employee: null,
  team: 'SST y jefe',
  version: 2,
};

export const PLANNED: SstIncidentDetail = {
  ...INVESTIGATING,
  id: SST_ID(12),
  code: 'SST-2026-0003',
  status: 'action_plan',
  root_causes: 'No hay revisión de soportes.',
  immediate_causes: 'Soporte suelto.',
  version: 3,
  actions: [
    {
      id: SST_ID(13),
      description: 'Ajustar soportes',
      responsible: LUIS,
      due_on: '2026-11-25',
      done_on: '2026-11-20',
      note: null,
      version: 2,
    },
  ],
};

export const UNSAFE: UnsafeReport = {
  id: SST_ID(14),
  code: 'RPT-2026-0001',
  kind: 'unsafe_condition',
  description: 'Cable suelto en el pasillo.',
  location: 'Pasillo 3',
  photo_file_id: null,
  reported_by: ANA,
  reported_at: '2026-11-18T13:00:00.000Z',
  status: 'reported',
  response: null,
  version: 1,
};

export const HAZARD: Hazard = {
  id: SST_ID(15),
  process: { id: SST_ID(16), name: 'Desarrollo de software' },
  activity: 'Trabajo en computador',
  routine: true,
  hazard_class: 'biomechanical',
  hazard: 'Postura prolongada',
  effects: 'Dolor lumbar',
  existing_controls: null,
  deficiency: 6,
  exposure: 4,
  consequence: 25,
  probability: 24,
  risk: 600,
  risk_level: 'I',
  proposed_controls: null,
  review_on: '2027-05-01',
  version: 1,
};

export const PLAN_ITEM: WorkPlanItem = {
  id: SST_ID(17),
  year: 2026,
  activity: 'Simulacro de evacuación',
  responsible: LUIS,
  due_on: '2026-10-01',
  done_on: null,
  evidence_file_id: null,
  overdue: true,
  version: 1,
};

export const HOME: Inspection = {
  id: SST_ID(18),
  kind: 'home',
  status: 'submitted',
  place: 'Bogotá, Chapinero',
  employee: ANA,
  inspector: ANA,
  due_on: '2026-11-30',
  inspected_on: '2026-11-19',
  answers: [{ code: 'SILLA', label: 'Silla ajustable', result: 'fail', note: null }],
  failed: 1,
  findings: null,
  version: 2,
};

export const CHECKLIST = [
  { code: 'SILLA', label: 'Silla ajustable' },
  { code: 'PANTALLA', label: 'Pantalla a la altura de los ojos' },
];

export const EXAM_SUMMARY: MedicalExamSummary = {
  id: SST_ID(19),
  employee: ANA,
  kind: 'periodic',
  exam_date: '2026-11-01',
  provider: 'IPS de prueba',
  concept: 'fit_with_restrictions',
  has_restrictions: true,
  next_due_on: '2026-12-01',
  due_soon: true,
  version: 1,
};

export const EXAM: MedicalExam = {
  ...EXAM_SUMMARY,
  restrictions: 'Evitar levantar más de 10 kilos.',
};

export const PPE: PpeDelivery = {
  id: SST_ID(20),
  employee: ANA,
  item: 'REPOSAPIES',
  item_label: 'Reposapiés',
  quantity: 1,
  delivered_on: '2026-11-10',
  delivered_by: LUIS,
  note: null,
  acknowledged_at: null,
  version: 1,
};

export const COMPLAINT: Complaint = {
  id: SST_ID(21),
  code: 'CCL-2026-0001',
  complainant: ANA,
  received_at: '2026-11-15T15:00:00.000Z',
  status: 'received',
  facts: 'Me gritan en las reuniones.',
  outcome: null,
  version: 1,
};

export const STANDARD: StandardItem = {
  code: '1.1.1',
  cycle: 'plan',
  label: 'Responsable del SG-SST',
  weight: 50,
  result: null,
  justification: null,
  evidence_file_id: null,
  improvement: null,
  assessed_by: null,
  version: 0,
};

export const MY_SST: MySst = {
  is_employee: true,
  reports: [
    {
      id: UNSAFE.id,
      code: UNSAFE.code,
      kind: 'unsafe_condition',
      location: UNSAFE.location,
      reported_at: UNSAFE.reported_at,
      status: 'Reportado',
    },
  ],
  complaints: [
    {
      id: COMPLAINT.id,
      code: COMPLAINT.code,
      received_at: COMPLAINT.received_at,
      status: 'received',
    },
  ],
  ppe: [PPE],
  home_inspections: [
    {
      ...HOME,
      status: 'requested',
      inspected_on: null,
      answers: [],
      failed: 0,
      version: 1,
      checklist: CHECKLIST,
    },
  ],
  actions: [
    {
      id: SST_ID(22),
      incident_code: 'SST-2026-0003',
      description: 'Ajustar soportes',
      due_on: '2026-11-25',
      version: 1,
    },
  ],
  committees: ['coexistence'],
};

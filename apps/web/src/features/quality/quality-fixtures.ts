import type {
  NonconformityDetailResponse,
  NonconformitySummary,
  QmsAction,
  QmsProcess,
  QmsRisk,
} from '@arza/contracts';

// Datos ficticios de las pantallas de Calidad (B38).

export const QMS_ID = (n: number): string =>
  `01999a00-0000-7000-8000-0000000b38${String(n).padStart(2, '0')}`;

export const ANA = { id: QMS_ID(1), name: 'Ana Prueba' };
export const LUIS = { id: QMS_ID(2), name: 'Luis Calidad' };
export const PROCESS_REF = { id: QMS_ID(3), name: 'SAC · Servicio al Cliente' };

export const ORG_PROCESS = {
  id: QMS_ID(3),
  parent_id: null,
  code: 'SAC',
  name: 'Servicio al Cliente',
  kind: 'process',
  owner_position_id: null,
  is_active: true,
  version: 1,
};

export const DETECTED: NonconformitySummary = {
  id: QMS_ID(10),
  code: 'NC-2026-0001',
  source: 'pqrsf',
  origin: { type: 'pqrsf', id: QMS_ID(11), code: 'PQRSF-2026-0007' },
  process: null,
  description: 'Queja PQRSF-2026-0007 declarada procedente.',
  classification: null,
  status: 'detected',
  detected_on: '2026-11-20',
  reported_by: LUIS,
  version: 1,
};

export const ANALYZING: NonconformitySummary = {
  ...DETECTED,
  id: QMS_ID(12),
  code: 'NC-2026-0002',
  source: 'report',
  origin: null,
  process: PROCESS_REF,
  classification: 'minor',
  status: 'analyzing',
  version: 3,
};

export const VERIFIED: NonconformitySummary = {
  ...ANALYZING,
  id: QMS_ID(13),
  code: 'NC-2026-0003',
  status: 'verified',
  version: 5,
};

export const OPEN_ACTION: QmsAction = {
  id: QMS_ID(20),
  code: 'AC-2026-0001',
  opened_on: '2026-11-20',
  origin_type: 'nonconformity',
  origin: { id: QMS_ID(12), code: 'NC-2026-0002' },
  process: PROCESS_REF,
  finding: 'El informe salió sin revisión.',
  root_cause: 'No hay quién revise el informe.',
  action_type: 'corrective',
  description: 'Asignar quién revisa el informe.',
  responsible: ANA,
  due_on: '2026-11-15',
  executed_on: null,
  evidence_note: null,
  evidence_file_id: null,
  status: 'open',
  overdue: true,
  verified_on: null,
  verified_by: null,
  verification_note: null,
  notes: null,
  version: 1,
};

export const EXECUTED_ACTION: QmsAction = {
  ...OPEN_ACTION,
  id: QMS_ID(21),
  code: 'AC-2026-0002',
  status: 'executed',
  overdue: false,
  executed_on: '2026-11-20',
  evidence_note: 'Procedimiento actualizado.',
  version: 2,
};

export const DETAIL: NonconformityDetailResponse = {
  nonconformity: {
    ...ANALYZING,
    containment: 'Se retiró el informe.',
    contained_on: '2026-11-20',
    analysis: { method: 'five_whys', whys: ['No se revisó', 'No había quién'] },
    root_cause: 'No hay quién revise el informe.',
    close_note: null,
    reopen_reason: null,
    closed_on: null,
  },
  actions: [OPEN_ACTION],
};

export const RISK: QmsRisk = {
  id: QMS_ID(30),
  code: 'RSG-2026-0001',
  kind: 'risk',
  process: PROCESS_REF,
  description: 'Pérdida del servidor de respaldo',
  causes: null,
  probability: 4,
  impact: 5,
  score: 20,
  level: 'critical',
  treatment: 'mitigate',
  treatment_plan: null,
  owner: ANA,
  review_on: '2026-12-01',
  review_due: false,
  status: 'active',
  version: 1,
};

export const PROCESSES: QmsProcess[] = [
  {
    id: QMS_ID(3),
    code: 'SAC',
    name: 'Servicio al Cliente',
    owner_position: null,
    characterization: {
      id: QMS_ID(40),
      process_type: 'core',
      objective: 'Atender al cliente a tiempo.',
      scope: null,
      inputs: null,
      outputs: null,
      document_id: null,
      version: 1,
    },
  },
  {
    id: QMS_ID(4),
    code: 'FIN',
    name: 'Gestión Financiera',
    owner_position: null,
    characterization: null,
  },
];

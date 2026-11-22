import type {
  Audit,
  AuditFinding,
  AuditProgram,
  Indicator,
  IndicatorMeasurement,
  ManagementReview,
  ManagementReviewSummary,
} from '@arza/contracts';

import { ANA, LUIS, QMS_ID } from './quality-fixtures';

// Datos ficticios de las pantallas de auditorías, indicadores y revisión por la dirección (B39).

const PROCESS_REF = { id: QMS_ID(3), name: 'SAC · Servicio al Cliente' };

export const AUDIT: Audit = {
  id: QMS_ID(60),
  code: 'AUD-2026-0001',
  program_id: QMS_ID(61),
  process: PROCESS_REF,
  auditor: ANA,
  planned_on: '2026-12-02',
  status: 'planned',
  findings: 0,
  version: 1,
  objective: 'Verificar el tratamiento de las salidas no conformes.',
  criteria: 'ISO 9001:2015',
  started_on: null,
  reported_on: null,
  conclusions: null,
  cancel_reason: null,
  checklist: [],
  report_document_id: null,
};

export const IN_PROGRESS: Audit = {
  ...AUDIT,
  status: 'in_progress',
  started_on: '2026-12-02',
  version: 2,
  checklist: [
    {
      requirement: 'ISO 9001 8.7',
      question: '¿Se registran las salidas no conformes?',
      result: 'nonconforming',
      evidence: 'Sin registro en octubre',
    },
  ],
};

export const OPPORTUNITY: AuditFinding = {
  id: QMS_ID(62),
  audit: { id: AUDIT.id, code: AUDIT.code },
  process: PROCESS_REF,
  type: 'opportunity',
  requirement: 'ISO 9001 10.3',
  description: 'Automatizar el aviso de vencimiento.',
  evidence: 'Entrevista al líder',
  nonconformity: null,
  action: null,
};

export const MINOR: AuditFinding = {
  ...OPPORTUNITY,
  id: QMS_ID(63),
  type: 'minor',
  description: 'Las salidas no conformes no tienen registro.',
  nonconformity: { id: QMS_ID(64), code: 'NC-2026-0010' },
};

export const REPORTED: Audit = {
  ...IN_PROGRESS,
  status: 'reported',
  reported_on: '2026-12-03',
  conclusions: 'Conforme con una excepción.',
  findings: 2,
  version: 4,
  report_document_id: QMS_ID(65),
};

export const PROGRAM: AuditProgram = {
  id: QMS_ID(61),
  year: 2027,
  objectives: 'Verificar la eficacia del sistema.',
  scope: 'Todos los procesos',
  criteria: 'ISO 9001:2015',
  status: 'draft',
  audits: [AUDIT],
  version: 1,
};

export const MEASUREMENTS: IndicatorMeasurement[] = [
  {
    id: QMS_ID(70),
    period_start: '2026-09-01',
    period: '09/2026',
    value: '4.5',
    meets: true,
    trend: null,
    analysis: 'Buen resultado',
    evidence_note: 'Encuesta',
    evidence_file_id: null,
    automatic: false,
    measured_by: ANA,
    version: 1,
  },
  {
    id: QMS_ID(71),
    period_start: '2026-10-01',
    period: '10/2026',
    value: '3.8',
    meets: false,
    trend: 'down',
    analysis: null,
    evidence_note: null,
    evidence_file_id: null,
    automatic: true,
    measured_by: null,
    version: 1,
  },
];

export const INDICATOR: Indicator = {
  id: QMS_ID(72),
  code: 'IND-001',
  process: PROCESS_REF,
  name: 'Satisfacción con la formación',
  objective: 'Que el personal valore la formación.',
  formula: 'Promedio de la encuesta',
  unit: 'score',
  target: '4',
  direction: 'higher_better',
  frequency: 'monthly',
  source: 'manual',
  responsible: ANA,
  active: true,
  last: MEASUREMENTS[1] ?? null,
  pending_period: '2026-10-01',
  version: 1,
};

export const AUTOMATIC: Indicator = {
  ...INDICATOR,
  id: QMS_ID(73),
  code: 'IND-002',
  name: 'Incidentes de trabajo',
  unit: 'count',
  target: '0',
  direction: 'lower_better',
  source: 'sst_incidents',
  last: null,
  pending_period: null,
};

export const REVIEW_SUMMARY: ManagementReviewSummary = {
  id: QMS_ID(80),
  code: 'RD-2026-0001',
  period_from: '2026-01-01',
  period_to: '2026-11-30',
  meeting_on: '2026-12-10',
  status: 'draft',
  version: 2,
};

export const REVIEW: ManagementReview = {
  ...REVIEW_SUMMARY,
  attendees: 'Dirección y Calidad',
  inputs: [
    {
      key: 'customer',
      title: 'Satisfacción del cliente y PQRSF',
      lines: ['Encuestas respondidas: 10; satisfacción promedio 4.20 de 5.'],
      comment: null,
    },
    {
      key: 'resources',
      title: 'Adecuación de los recursos',
      lines: [],
      comment: 'Falta un analista.',
    },
  ],
  inputs_loaded_at: '2026-12-01T15:00:00.000Z',
  conclusions: null,
  decisions: [
    {
      description: 'Contratar un analista.',
      responsible: LUIS,
      due_on: '2027-01-31',
      action: null,
    },
  ],
  return_reason: null,
  approved_by: null,
  approved_on: null,
  document_id: null,
};

export const SUBMITTED: ManagementReview = {
  ...REVIEW,
  status: 'submitted',
  conclusions: 'El sistema es eficaz.',
  version: 4,
};

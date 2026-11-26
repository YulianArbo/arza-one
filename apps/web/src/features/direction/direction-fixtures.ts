import type {
  DashboardData,
  Drilldown,
  LegalImportResponse,
  LegalRequirement,
  Scorecard,
} from '@arza/contracts';

// Datos ficticios de las pruebas de Dirección (B46).

export const DIR_ID = (n: number): string =>
  `01900000-0000-7000-8000-${String(n).padStart(12, '0')}`;

export const ME = { id: DIR_ID(1), name: 'Paula Calidad' };

export const EXECUTIVE: DashboardData = {
  generated_at: '2026-11-26T20:05:00.000Z',
  figures: [
    {
      key: 'sales_month',
      label: 'Ventas facturadas del mes',
      unit: 'pesos',
      value: '1234567.89',
      detail: '3 documentos',
      how: 'Suma del subtotal de las facturas del mes.',
      allowed: true,
      link: '/app/finanzas/facturas',
    },
    {
      key: 'receivables_open',
      label: 'Cartera por cobrar',
      unit: 'pesos',
      value: null,
      detail: null,
      how: 'Saldo de las facturas emitidas.',
      allowed: false,
      link: '/app/finanzas/facturas',
    },
    {
      key: 'legal_compliance',
      label: 'Cumplimiento legal',
      unit: 'percent',
      value: '87.50',
      detail: '8 requisitos evaluados',
      how: 'Requisitos que cumplen ÷ evaluados.',
      allowed: true,
      link: '/app/direccion/normograma',
    },
    {
      key: 'satisfaction',
      label: 'Satisfacción de los clientes',
      unit: 'score',
      value: null,
      detail: '0 encuestas respondidas',
      how: 'Promedio de la satisfacción.',
      allowed: true,
      link: '/app/servicio/encuestas',
    },
  ],
};

export const SALES_ROWS: Drilldown = {
  figure: 'sales_month',
  label: 'Ventas facturadas del mes',
  columns: [
    { key: 'code', label: 'Documento' },
    { key: 'amount', label: 'Valor' },
  ],
  rows: [{ id: DIR_ID(20), cells: { code: 'FAC-2026-0001', amount: '$ 1.000' } }],
  truncated: false,
  link: '/app/finanzas/facturas',
};

export const SCORECARD: Scorecard = {
  generated_at: '2026-11-26T20:05:00.000Z',
  scope: 'own',
  perspectives: [
    { perspective: 'financial', label: 'Financiera', objectives: [] },
    {
      perspective: 'customer',
      label: 'Clientes',
      objectives: [
        {
          id: DIR_ID(30),
          code: 'OBJ-001',
          name: 'Clientes más satisfechos',
          status: 'partial',
          indicators: [
            {
              id: DIR_ID(31),
              code: 'IND-001',
              name: 'Satisfacción',
              process: 'SAC · Servicio',
              unit: 'score',
              target: '4',
              value: '4.5',
              period: '10/2026',
              meets: true,
              trend: 'up',
            },
            {
              id: DIR_ID(32),
              code: 'IND-002',
              name: 'PQRSF a tiempo',
              process: 'SAC · Servicio',
              unit: 'percent',
              target: '95',
              value: null,
              period: null,
              meets: null,
              trend: null,
            },
          ],
        },
      ],
    },
    { perspective: 'internal', label: 'Procesos internos', objectives: [] },
    { perspective: 'learning', label: 'Aprendizaje y crecimiento', objectives: [] },
  ],
};

export const REQUIREMENT: LegalRequirement = {
  id: DIR_ID(40),
  code: 'NRM-001',
  norm_type: 'law',
  norm: 'Ley 1581 de 2012',
  issuer: 'Congreso de la República',
  article: 'Art. 9',
  requirement: 'Autorización previa del titular.',
  compliance_means: 'Casilla no premarcada.',
  process: null,
  responsible: null,
  applies: true,
  last_evaluation: null,
  pending: true,
  version: 1,
};

export const EVALUATED: LegalRequirement = {
  ...REQUIREMENT,
  id: DIR_ID(41),
  code: 'NRM-002',
  norm: 'Ley 1480 de 2011',
  pending: false,
  last_evaluation: {
    id: DIR_ID(42),
    period_start: '2026-07-01',
    period: 'S2 2026',
    evaluated_on: '2026-11-20',
    result: 'fails',
    evidence_note: 'No se encontró el formulario.',
    evidence_file_id: null,
    action: { id: DIR_ID(43), code: 'AC-2026-0007' },
    evaluated_by: ME,
  },
};

export const IMPORT_REVIEW: LegalImportResponse = {
  applied: false,
  created: 1,
  updated: 0,
  rows: [{ line: 2, norm: 'Ley 2300 de 2023', article: null, outcome: 'create', errors: [] }],
};

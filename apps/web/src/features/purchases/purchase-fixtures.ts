// Datos ficticios de las pruebas de pantallas del B33.

export const CENTER_ID = '01999a00-0000-7000-8000-0000000fc101';
export const REQUEST_ID = '01999a00-0000-7000-8000-0000000fc201';
export const QUOTE_ID = '01999a00-0000-7000-8000-0000000fc301';
export const ORDER_ID = '01999a00-0000-7000-8000-0000000fc401';
export const SUPPLIER_ID = '01999a00-0000-7000-8000-0000000fc501';
export const TRAVEL_ID = '01999a00-0000-7000-8000-0000000fc601';
const PERSON = { id: '01999a00-0000-7000-8000-0000000fc701', name: 'Laura Compras' };
const FILE_ID = '01999a00-0000-7000-8000-0000000fc801';

const CENTER = { id: CENTER_ID, code: 'CC-ADM', name: 'Administración' };

export const TIERS = {
  low_limit: '1000000.00',
  mid_limit: '10000000.00',
  quotes_low: 1,
  quotes_mid: 2,
  quotes_high: 3,
};

export const OPTIONS = {
  data: {
    cost_centers: [CENTER],
    suppliers: [
      { id: SUPPLIER_ID, name: 'Papelería El Cóndor Ltda.', verified: true },
      {
        id: '01999a00-0000-7000-8000-0000000fc502',
        name: 'Suministros Andinos S.A.S.',
        verified: false,
      },
    ],
    tiers: TIERS,
  },
};

export const QUOTE = {
  id: QUOTE_ID,
  supplier: { id: SUPPLIER_ID, name: 'Papelería El Cóndor Ltda.', verified: true },
  amount: '4800000.00',
  delivery_days: 5,
  file_id: FILE_ID,
  selected: false,
};

export const REQUEST = {
  id: REQUEST_ID,
  code: 'SC-2026-0001',
  description: 'Sillas ergonómicas de prueba',
  estimated_amount: '5000000.00',
  approval_amount: '5000000.00',
  tier: 'mid',
  min_quotes: 2,
  cost_center: CENTER,
  requester: PERSON,
  status: 'in_approval',
  decision_note: null,
  mine: false,
  quotes: [],
  order: null,
  version: 2,
} as const;

export const ORDER = {
  id: ORDER_ID,
  code: 'OC-2026-0001',
  request: { id: REQUEST_ID, code: 'SC-2026-0001', description: 'Sillas ergonómicas de prueba' },
  supplier: { id: SUPPLIER_ID, name: 'Papelería El Cóndor Ltda.' },
  total: '4800000.00',
  status: 'issued',
  issued_at: '2026-11-10T15:00:00.000Z',
  requested_by_me: false,
  receipts: [],
  version: 1,
} as const;

export const RECEIPT = {
  id: '01999a00-0000-7000-8000-0000000fc402',
  received_on: '2026-11-11',
  received_by: PERSON,
  conforming: false,
  note: 'Llegaron dos sillas menos',
};

export const EVALUATION = {
  id: '01999a00-0000-7000-8000-0000000fc901',
  supplier: { id: SUPPLIER_ID, name: 'Papelería El Cóndor Ltda.' },
  kind: 'reevaluation',
  period: '2026-2',
  criteria: { quality: 5, compliance: 4, price: 4, service: 4 },
  score: '4.25',
  result: 'approved',
  note: null,
  evaluated_by: PERSON,
  evaluated_at: '2026-11-10T15:00:00.000Z',
} as const;

export const TRAVEL = {
  id: TRAVEL_ID,
  code: 'SV-2026-0001',
  traveler: PERSON,
  destination: 'Medellín',
  purpose: 'Visita de seguimiento de prueba',
  starts_on: '2026-11-03',
  ends_on: '2026-11-05',
  advance_amount: '500000.00',
  status: 'approved',
  decision_note: null,
  expenses: [
    {
      id: '01999a00-0000-7000-8000-0000000fc602',
      concept: 'Hotel de prueba',
      amount: '570000.50',
      support_file_id: FILE_ID,
    },
  ],
  expenses_total: '570000.50',
  balance: '-70000.50',
  mine: true,
  version: 3,
} as const;

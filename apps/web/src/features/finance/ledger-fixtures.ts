// Datos ficticios de las pruebas de pantallas del B32.

export const CENTER_ID = '01999a00-0000-7000-8000-0000000fb101';
export const BUDGET_ID = '01999a00-0000-7000-8000-0000000fb201';
export const EXPENSE_ID = '01999a00-0000-7000-8000-0000000fb301';
export const RECON_ID = '01999a00-0000-7000-8000-0000000fb401';
export const PROJECT_ID = '01999a00-0000-7000-8000-0000000fb501';
export const BATCH_ID = '01999a00-0000-7000-8000-0000000fb601';
export const FILE_ID = '01999a00-0000-7000-8000-0000000fb701';

export const CENTER = { id: CENTER_ID, code: 'CC-DEV', name: 'Desarrollo' };

export const OPTIONS = {
  data: {
    cost_centers: [CENTER],
    categories: [
      { code: 'SOFTWARE', label: 'Software y licencias' },
      { code: 'TRANSPORT', label: 'Transporte' },
    ],
    suppliers: [{ id: '01999a00-0000-7000-8000-0000000fb801', name: 'Papelería El Cóndor Ltda.' }],
  },
};

export const BUDGET = {
  id: BUDGET_ID,
  year: 2026,
  status: 'draft',
  planned_total: '1000000.00',
  line_count: 1,
  mine: false,
  approved_at: null,
  version: 2,
} as const;

export const BUDGET_DETAIL = {
  ...BUDGET,
  lines: [
    {
      id: '01999a00-0000-7000-8000-0000000fb202',
      cost_center: CENTER,
      category: { code: 'SOFTWARE', label: 'Software y licencias' },
      month: 3,
      planned: '1000000.00',
    },
  ],
};

export const EXECUTION = {
  data: {
    year: 2026,
    rows: [],
    by_cost_center: [{ cost_center: CENTER, planned: '1000000.00', executed: '250000.00' }],
  },
};

export const EXPENSE = {
  id: EXPENSE_ID,
  code: 'GAS-2026-0001',
  expense_date: '2026-11-05',
  amount: '120000.50',
  category: { code: 'SOFTWARE', label: 'Software y licencias' },
  cost_center: CENTER,
  supplier: null,
  description: 'Licencia ficticia',
  support_file_id: FILE_ID,
  status: 'pending',
  decision_note: null,
  mine: false,
  version: 1,
} as const;

export const PETTY_CASH = {
  data: {
    fund: '500000.00',
    balance: '450000.00',
    movements: [
      {
        id: '01999a00-0000-7000-8000-0000000fb901',
        code: 'CM-2026-0002',
        movement_date: '2026-11-04',
        type: 'voucher',
        amount: '50000.00',
        concept: 'Taxi a reunión',
        cost_center: CENTER,
        category: { code: 'TRANSPORT', label: 'Transporte' },
        support_file_id: null,
        balance: '450000.00',
      },
    ],
  },
};

export const PERIODS = {
  data: [
    {
      period: '2026-11',
      status: 'open',
      closable: false,
      pending_expenses: 0,
      closed_at: null,
      batch_id: null,
    },
    {
      period: '2026-10',
      status: 'open',
      closable: true,
      pending_expenses: 0,
      closed_at: null,
      batch_id: null,
    },
  ],
};

export const BATCHES = {
  data: [
    {
      id: BATCH_ID,
      period: '2026-09',
      kind: 'definitive',
      row_count: 4,
      totals: {
        invoice: '1190.00',
        credit_note: '0.00',
        payment: '1190.00',
        expense: '120000.50',
        petty_cash: '450000.00',
      },
      checksum: 'a'.repeat(64),
      file_name: 'contabilidad-2026-09-definitivo.csv',
      exported_at: '2026-10-02T15:00:00.000Z',
    },
  ],
};

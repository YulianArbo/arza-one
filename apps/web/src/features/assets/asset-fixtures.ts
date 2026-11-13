// Datos ficticios de las pruebas de pantallas del B34.

export const ASSET_ID = '01999a00-0000-7000-8000-0000000fd101';
export const ASSIGNMENT_ID = '01999a00-0000-7000-8000-0000000fd201';
export const MAINTENANCE_ID = '01999a00-0000-7000-8000-0000000fd301';
export const HOLDER_ID = '01999a00-0000-7000-8000-0000000fd401';
const SIGNED_FILE_ID = '01999a00-0000-7000-8000-0000000fd501';

export const ASSET = {
  id: ASSET_ID,
  code: 'ACT-2026-0001',
  name: 'Portátil de desarrollo',
  category: 'computer',
  serial: 'SN-001',
  purchase_date: '2026-01-15',
  cost: '3600000.00',
  useful_life_months: 36,
  status: 'available',
  location: 'Sede principal',
  assignment: null,
  retired_on: null,
  retire_reason: null,
  retire_note: null,
  accumulated_depreciation: '900000.00',
  book_value: '2700000.00',
  version: 1,
} as const;

const ASSIGNMENT = {
  id: ASSIGNMENT_ID,
  holder: { id: HOLDER_ID, name: 'Ana Gómez' },
  status: 'active',
  assigned_on: '2026-11-01',
  sign_by: '2026-11-16',
  record_code: 'CT-ADM-001-2026-0001',
  envelope_code: 'FE-2026-0007',
  contract_document_id: SIGNED_FILE_ID,
  returned_on: null,
  return_note: null,
  closed_reason: null,
  version: 3,
} as const;

export const ASSIGNED = {
  ...ASSET,
  id: '01999a00-0000-7000-8000-0000000fd104',
  code: 'ACT-2026-0004',
  name: 'Portátil de diseño',
  serial: 'SN-004',
  status: 'assigned',
  assignment: ASSIGNMENT,
  version: 4,
};

export const RESERVED = {
  ...ASSET,
  id: '01999a00-0000-7000-8000-0000000fd102',
  code: 'ACT-2026-0002',
  name: 'Monitor de 27 pulgadas',
  category: 'peripheral',
  serial: null,
  status: 'reserved',
  assignment: {
    ...ASSIGNMENT,
    status: 'in_signature',
    contract_document_id: null,
    version: 2,
  },
};

export const RETIRED = {
  ...ASSET,
  id: '01999a00-0000-7000-8000-0000000fd103',
  code: 'ACT-2026-0003',
  name: 'Silla antigua',
  category: 'furniture',
  status: 'retired',
  retired_on: '2026-10-30',
  retire_reason: 'damage',
  retire_note: 'Base rota',
};

export const MAINTENANCE = {
  id: MAINTENANCE_ID,
  asset: { id: ASSET_ID, code: 'ACT-2026-0001', name: 'Portátil de desarrollo' },
  kind: 'preventive',
  scheduled_on: '2026-11-20',
  done_on: null,
  cost: null,
  note: 'Limpieza interna',
  version: 1,
} as const;

export const DONE_MAINTENANCE = {
  ...MAINTENANCE,
  id: '01999a00-0000-7000-8000-0000000fd302',
  kind: 'corrective',
  done_on: '2026-11-05',
  cost: '120000.00',
  version: 2,
};

export const ASSIGNEES = {
  data: [
    { id: HOLDER_ID, name: 'Ana Gómez', ready: true },
    { id: '01999a00-0000-7000-8000-0000000fd402', name: 'Luis Pérez', ready: false },
  ],
};

export const RETURNED_ASSIGNMENT = {
  ...ASSIGNMENT,
  id: '01999a00-0000-7000-8000-0000000fd202',
  status: 'returned',
  returned_on: '2026-10-01',
  return_note: 'En buen estado',
};

export const CANCELLED_ASSIGNMENT = {
  ...ASSIGNMENT,
  id: '01999a00-0000-7000-8000-0000000fd203',
  status: 'cancelled',
  contract_document_id: null,
  closed_reason: 'El colaborador rechazó el comodato.',
};

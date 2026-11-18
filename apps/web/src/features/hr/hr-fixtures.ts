import type { Candidate, EmployeeDetail, Vacancy } from '@arza/contracts';

// Datos ficticios de las pantallas de Talento humano (B35).

export const VACANCY_ID = '01999a00-0000-7000-8000-0000000fd201';
export const CANDIDATE_ID = '01999a00-0000-7000-8000-0000000fd202';
export const EMPLOYEE_ID = '01999a00-0000-7000-8000-0000000fd203';
const POSITION_ID = '01999a00-0000-7000-8000-0000000fd204';

export const VACANCY: Vacancy = {
  id: VACANCY_ID,
  code: 'VAC-2026-0001',
  position: { id: POSITION_ID, name: 'Analista de pruebas' },
  reason: 'new_position',
  description: null,
  status: 'open',
  opened_on: '2026-11-02',
  closed_on: null,
  close_note: null,
  candidate_count: 1,
  version: 1,
};

export const CANDIDATE: Candidate = {
  id: CANDIDATE_ID,
  name: 'Ana Prueba',
  vacancy: { id: VACANCY_ID, code: 'VAC-2026-0001', position: 'Analista de pruebas' },
  source: 'referral',
  stage: 'applied',
  applied_on: '2026-11-03',
  email: 'ana@candidata.test',
  phone: null,
  id_type: 'CC',
  id_number: '1000000001',
  resume_file_id: null,
  talent_bank: false,
  discarded_on: null,
  discard_reason: null,
  retention_until: null,
  erased_at: null,
  evaluations: [],
  employee_id: null,
  version: 3,
};

/** Descartada, en el banco de hojas de vida y con sus datos aún guardados. */
export const BANKED: Candidate = {
  ...CANDIDATE,
  stage: 'discarded',
  talent_bank: true,
  discarded_on: '2026-11-10',
  discard_reason: 'Perfil para otra vacante',
  retention_until: '2027-11-10',
};

export function employeeDetail(
  overrides: { readonly status?: 'pending' | 'active'; readonly contract?: object } = {},
): EmployeeDetail {
  return {
    employee: {
      id: EMPLOYEE_ID,
      name: 'Ana Prueba',
      position: { id: POSITION_ID, name: 'Analista de pruebas' },
      hire_date: '2026-12-01',
      contract_type: 'indefinite',
      work_mode: 'on_site',
      status: overrides.status ?? 'pending',
      user_id: null,
      candidate_id: CANDIDATE_ID,
      version: 4,
    },
    email: 'ana.prueba@empresa.test',
    contract: { ...CONTRACT, ...overrides.contract },
    file: [],
    onboarding: [],
  };
}

const CONTRACT: NonNullable<EmployeeDetail['contract']> = {
  id: '01999a00-0000-7000-8000-0000000fd205',
  record_code: null,
  envelope_code: 'FE-2026-0007',
  type: 'indefinite',
  starts_on: '2026-12-01',
  ends_on: null,
  salary_band: 'BANDA_2',
  salary_band_label: 'Banda 2',
  salary: '3500000.00',
  status: 'signed',
  signers: [],
  sign_by: '2026-12-11',
  signed_on: '2026-11-20',
  closed_reason: null,
  my_turn: false,
  document_available: true,
  version: 2,
};

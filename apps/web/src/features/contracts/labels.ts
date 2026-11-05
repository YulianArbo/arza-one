import {
  AMENDMENT_KINDS,
  AMENDMENT_STATUSES,
  CLAUSE_ORIGINS,
  CONTRACT_KINDS,
  CONTRACT_RENEWALS,
  CONTRACT_STATUSES,
  OBLIGATION_STATUSES,
  type AmendmentStatus,
  type ClauseOrigin,
  type ContractStatus,
  type ObligationStatus,
} from '@arza/contracts';

// Textos y rutas de Contratos (B24). Las etiquetas vienen de los contratos; aquí solo los tonos y
// las rutas.

type Tone = 'neutral' | 'success' | 'warning' | 'destructive' | 'info';

const BASE = '/app/contratos';

export const CONTRACT_PATHS = {
  list: BASE,
  create: `${BASE}/nuevo`,
  fromQuote: (quoteId: string) => `${BASE}/nuevo?cotizacion=${quoteId}`,
  contract: (id: string) => `${BASE}/${id}`,
  edit: (id: string) => `${BASE}/${id}/editar`,
  clauses: `${BASE}/clausulas`,
} as const;

export {
  AMENDMENT_KINDS,
  AMENDMENT_STATUSES,
  CLAUSE_ORIGINS,
  CONTRACT_KINDS,
  CONTRACT_RENEWALS,
  CONTRACT_STATUSES,
  OBLIGATION_STATUSES,
};

export const CONTRACT_STATUS_TONES: Readonly<Record<ContractStatus, Tone>> = {
  draft: 'neutral',
  in_review: 'warning',
  approved: 'info',
  in_signature: 'info',
  active: 'success',
  expiring: 'warning',
  terminated: 'neutral',
};

export const CLAUSE_ORIGIN_TONES: Readonly<Record<ClauseOrigin, Tone>> = {
  library: 'neutral',
  modified: 'warning',
  added: 'warning',
};

export const OBLIGATION_TONES: Readonly<Record<ObligationStatus, Tone>> = {
  pending: 'info',
  done: 'success',
  overdue: 'destructive',
};

export const AMENDMENT_TONES: Readonly<Record<AmendmentStatus, Tone>> = {
  in_review: 'warning',
  approved: 'info',
  in_signature: 'info',
  returned: 'neutral',
  signed: 'success',
};

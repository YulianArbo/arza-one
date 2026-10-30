// Datos ficticios de las pruebas de las pantallas de firma electrónica (B25). Ninguno es real.

import type { PermissionCode } from '@arza/contracts';

import { CONTRACT_ID } from './contract-fixtures';
import { SESSION } from './fake-api';
import { permissionsOf } from './party-fixtures';

export const ENVELOPE_ID = '01999a00-0000-7000-8000-0000000e0001';
export const CLIENT_SIGNER_ID = '01999a00-0000-7000-8000-0000000e0101';
const COMPANY_SIGNER_ID = '01999a00-0000-7000-8000-0000000e0102';
const PERSON_ID = '01999a00-0000-7000-8000-0000000e0201';

const BASE: readonly PermissionCode[] = [
  'party.read',
  'contract.read',
  'contract.create',
  'contract.update',
  'signature.envelope.create',
  'signature.evidence.read',
];

export const SIGNATURE_SALES = permissionsOf(BASE);
export const SIGNATURE_DIRECTION = permissionsOf([
  ...BASE,
  'contract.approve',
  'signature.envelope.send',
  'signature.envelope.cancel',
]);

export const ENVELOPE_OPTIONS = {
  document: { code: 'CTR-2026-0001', title: 'Portal de clientes', sha256: 'b'.repeat(64) },
  party: { id: '01999a00-0000-7000-8000-00000000f001', name: 'Comercializadora Andina S.A.S.' },
  party_verified: true,
  client_signers: [
    {
      person_id: PERSON_ID,
      name: 'Laura Gómez',
      email: 'laura@cliente.test',
      id_number: 'CC 43000000',
      ready: true,
    },
    {
      person_id: '01999a00-0000-7000-8000-0000000e0202',
      name: 'Pedro Sin Correo',
      email: null,
      id_number: 'CC 44000000',
      ready: false,
    },
  ],
  company_signers: [
    {
      user_id: SESSION.user.id,
      person_id: '01999a00-0000-7000-8000-0000000e0203',
      name: 'Diego Director',
      email: 'diego@arza.test',
      id_number: 'CC 80000000',
      ready: true,
    },
  ],
  default_expires_on: '2026-11-14',
  max_expires_on: '2026-11-29',
};

function signer(overrides: object): object {
  return {
    id: CLIENT_SIGNER_ID,
    kind: 'client',
    sign_order: 1,
    name: 'Laura Gómez',
    email: 'laura@cliente.test',
    id_number: 'CC 43000000',
    role: 'Por Comercializadora Andina S.A.S.',
    status: 'waiting',
    method: null,
    opened_at: null,
    signed_at: null,
    rejected_at: null,
    reject_reason: null,
    reminders: 0,
    code_locked: false,
    is_me: false,
    ...overrides,
  };
}

const DEFAULT_SIGNERS = [
  signer({}),
  signer({
    id: COMPANY_SIGNER_ID,
    kind: 'company',
    sign_order: 2,
    name: 'Diego Director',
    email: 'diego@arza.test',
    id_number: 'CC 80000000',
    role: 'Por ARZA TECH S.A.S.',
  }),
];

const CREATED_EVENT = {
  id: '01999a00-0000-7000-8000-0000000e0301',
  type: 'created',
  signer_name: null,
  occurred_at: '2026-10-30T15:00:00.000Z',
  ip: '190.0.0.1',
  user_agent: 'Navegador',
  hash: 'c'.repeat(64),
};

/** Un proceso de firma del contrato; por omisión, preparado y sin enviar. */
export function envelope(overrides: object = {}, signers: readonly object[] = []): object {
  return {
    id: ENVELOPE_ID,
    code: 'FE-2026-0001',
    source: 'contract',
    document: {
      id: CONTRACT_ID,
      code: 'CTR-2026-0001',
      title: 'Portal de clientes',
      sha256: 'b'.repeat(64),
    },
    status: 'draft',
    message: null,
    expires_at: '2026-11-15T04:59:59.999Z',
    sent_at: null,
    completed_at: null,
    closed_reason: null,
    signed: null,
    signers: signers.length > 0 ? signers : DEFAULT_SIGNERS,
    events: [CREATED_EVENT],
    chain_intact: true,
    created_at: '2026-10-30T15:00:00.000Z',
    version: 1,
    ...overrides,
  };
}

/** Le toca a la empresa, y la persona con sesión es quien firma por ella. */
export const COMPANY_TURN = {
  status: 'sent',
  sent_at: '2026-10-30T15:05:00.000Z',
};

export const COMPANY_TURN_SIGNERS = [
  signer({ status: 'signed', method: 'email_code', signed_at: '2026-10-30T16:00:00.000Z' }),
  signer({
    id: COMPANY_SIGNER_ID,
    kind: 'company',
    sign_order: 2,
    name: 'Diego Director',
    email: 'diego@arza.test',
    id_number: 'CC 80000000',
    role: 'Por ARZA TECH S.A.S.',
    status: 'pending',
    is_me: true,
  }),
];

export const COMPLETED = {
  status: 'completed',
  sent_at: '2026-10-30T15:05:00.000Z',
  completed_at: '2026-10-30T17:00:00.000Z',
  signed: { status: 'ready', sha256: 'd'.repeat(64), verification_code: 'ABCD-EFGH-JKLM' },
};

/** Lo que ve en su enlace quien firma por el cliente. */
export function publicSignature(overrides: object = {}): object {
  return {
    company: { name: 'ARZA TECH S.A.S.', tax_id: '900000000-1' },
    document: {
      code: 'CTR-2026-0001',
      title: 'Portal de clientes',
      kind: 'Contrato',
      sha256: 'b'.repeat(64),
    },
    signer: {
      name: 'Laura Gómez',
      id_number: 'CC 43000000',
      role: 'Por Comercializadora Andina S.A.S.',
      email_hint: 'la***@cliente.test',
    },
    state: 'pending',
    acceptance_text:
      'He leído y acepto el contenido de este documento y lo firmo electrónicamente.',
    expires_at: '2026-11-15T04:59:59.999Z',
    signed_at: null,
    code_locked: false,
    signed_copy: false,
    ...overrides,
  };
}

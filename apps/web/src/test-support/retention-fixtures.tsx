// Datos ficticios de las pruebas de retención, disposición final y búsqueda (B21). Ninguno es real.

import type { PermissionCode } from '@arza/contracts';

import { DOCUMENT_ID } from './doc-fixtures';

export const RULE_ID = '01999a00-0000-7000-8000-00000000e001';
export const PROPOSAL_ID = '01999a00-0000-7000-8000-00000000e101';
export const ITEM_ID = '01999a00-0000-7000-8000-00000000e201';
const KEPT_ID = '01999a00-0000-7000-8000-00000000e202';
const KEPT_DOCUMENT = '01999a00-0000-7000-8000-00000000b102';

function permissions(role: string, codes: readonly PermissionCode[]): object {
  return {
    roles: [{ id: '01999a00-0000-7000-8000-00000000c041', code: role, name: role }],
    permissions: codes.map((code) => ({ code, scope: 'all' })),
  };
}

/** Calidad: administra la tabla y prepara las propuestas; también puede aprobar. */
export const RETENTION_QUALITY = permissions('CALIDAD', [
  'doc.document.read',
  'doc.retention.manage',
  'doc.disposition.approve',
  'party.read',
  'core.org.read',
]);

/** Dirección: ve y decide las propuestas, sin administrar la tabla. */
export const RETENTION_DIRECTOR = permissions('DIRECCION', [
  'doc.document.read',
  'doc.disposition.approve',
]);

export function ruleOf(overrides: object = {}): Record<string, unknown> {
  return {
    id: RULE_ID,
    code: 'CON-01',
    name: 'Contratos con clientes',
    doc_type: 'CT',
    doc_type_label: 'Contrato',
    process: null,
    active_years: 2,
    archive_years: 8,
    disposition: 'destroy',
    legal_basis: 'Ley 962 de 2005, art. 28',
    is_active: true,
    documents: 4,
    version: 1,
    ...overrides,
  };
}

function item(overrides: object): Record<string, unknown> {
  return {
    id: ITEM_ID,
    document: {
      id: DOCUMENT_ID,
      code: 'DOC-2015-0001',
      title: 'Contrato de soporte',
      doc_type: 'CT',
      status: 'current',
    },
    rule: { id: RULE_ID, code: 'CON-01', name: 'Contratos con clientes', disposition: 'destroy' },
    due_on: '2025-03-15',
    action: 'destroy',
    keep_reason: null,
    executed_at: null,
    version: 1,
    ...overrides,
  };
}

export function proposalOf(overrides: object = {}): Record<string, unknown> {
  return {
    id: PROPOSAL_ID,
    code: 'DIS-2026-0001',
    period: '2026-10-01',
    status: 'review',
    to_destroy: 1,
    to_keep: 1,
    created_at: '2026-10-01T11:10:00.000Z',
    sent_by: null,
    sent_at: null,
    decided_by: null,
    decided_at: null,
    decision_note: null,
    executed_at: null,
    has_certificate: false,
    workflow_instance_id: null,
    step: 'Revisión de Calidad',
    actions: ['send'],
    can_edit_items: true,
    version: 2,
    items: [
      item({}),
      item({
        id: KEPT_ID,
        document: {
          id: KEPT_DOCUMENT,
          code: 'PR-SGC-002',
          title: 'Procedimiento antiguo',
          doc_type: 'PR',
          status: 'obsolete',
        },
        action: 'keep',
        keep_reason: 'Valor histórico',
      }),
    ],
    ...overrides,
  };
}

export const RETENTION_OF_DOCUMENT = {
  rule: {
    id: RULE_ID,
    code: 'CON-01',
    name: 'Contratos con clientes',
    active_years: 2,
    archive_years: 8,
    disposition: 'destroy',
  },
  explicit: false,
  base_on: '2015-03-15',
  due_on: '2025-03-15',
  expired: true,
  version: 2,
};

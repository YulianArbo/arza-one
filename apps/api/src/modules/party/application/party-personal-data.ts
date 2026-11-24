import type { PersonalDataRecord } from '@arza/contracts';

import type { Party, PartyRole } from '../../../generated/prisma/client.js';
import { recordAuditEvent } from '../../../platform/audit/audit-recorder.js';
import type { TenantTransaction } from '../../../platform/database/tenant-context.js';
import {
  shownDate,
  type ErasureActor,
  type ErasureOutcome,
  type HolderRecord,
} from '../../privacy/index.js';
import { partyName } from './party-support.js';

// La ficha del titular ante Privacidad (B42, decisiones 6 y 8): lo que guarda Terceros para
// entregárselo y, al suprimir, la ficha anónima o, si otro módulo debe conservar datos por ley,
// bloqueada con ese motivo. Terceros no consulta a los demás módulos: Privacidad le dice el motivo.

const ROLE_LABELS: Readonly<Record<string, string>> = {
  customer: 'Cliente',
  supplier: 'Proveedor',
  employee: 'Colaborador',
  contact: 'Contacto',
  candidate: 'Candidato',
};

type PartyWithRoles = Party & { roles: PartyRole[] };

function recordOf(party: PartyWithRoles): PersonalDataRecord {
  const roles = party.roles
    .filter((role) => role.status === 'active' && role.deletedAt === null)
    .map((role) => ROLE_LABELS[role.role] ?? role.role);
  return {
    title: 'Ficha en Terceros',
    fields: [
      { label: 'Nombre', value: partyName(party) },
      {
        label: 'Documento',
        value: party.idNumber === null ? null : `${party.idType ?? ''} ${party.idNumber}`.trim(),
      },
      { label: 'Correo', value: party.email },
      { label: 'Teléfono', value: party.phone },
      { label: 'Ciudad', value: party.city },
      { label: 'Dirección', value: party.address },
      { label: 'Relación con la empresa', value: roles.length === 0 ? null : roles.join(', ') },
      { label: 'Registrado el', value: shownDate(party.createdAt) },
    ],
  };
}

export async function holderOf(tx: TenantTransaction, id: string): Promise<HolderRecord | null> {
  const party = await tx.party.findFirst({ where: { id }, include: { roles: true } });
  if (party === null) return null;
  return { name: partyName(party), email: party.email, record: recordOf(party) };
}

/** Lo que reemplaza la identidad al suprimirla. */
function anonymized(at: Date) {
  return {
    firstName: 'Titular',
    lastName: 'Suprimido',
    idType: null,
    idNumber: null,
    checkDigit: null,
    email: null,
    phone: null,
    city: null,
    address: null,
    dataPurpose: null,
    dataAuthorization: null,
    dataAuthorizedOn: null,
    logoFileId: null,
    // Sin documento, la base de datos solo admite la ficha como prospecto; además queda retirada.
    status: 'prospect',
    statusReason: 'Datos suprimidos a pedido del titular',
    deletedAt: at,
    dataErasedAt: at,
    dataBlockedAt: null,
    dataBlockReason: null,
  };
}

export async function settlePartyErasure(
  tx: TenantTransaction,
  id: string,
  blockReason: string | null,
  actor: ErasureActor,
): Promise<ErasureOutcome> {
  const party = await tx.party.findFirst({ where: { id, kind: 'person' } });
  if (party === null) return { outcome: 'none', count: 0, reason: null };
  const data =
    blockReason === null
      ? anonymized(actor.at)
      : { dataBlockedAt: actor.at, dataBlockReason: blockReason };
  await tx.party.update({ where: { id }, data });
  await recordAuditEvent(tx, {
    tenantId: actor.tenantId,
    occurredAt: actor.at,
    actor: actor.userId === null ? { kind: 'system' } : { kind: 'user', id: actor.userId },
    action: blockReason === null ? 'party.personal_data.erase' : 'party.personal_data.block',
    entityType: 'party',
    entityId: id,
    result: 'success',
    changes: { request_code: actor.requestCode, blocked: blockReason !== null },
    meta: actor.meta,
  });
  return blockReason === null
    ? { outcome: 'erased', count: 1, reason: null }
    : { outcome: 'blocked', count: 1, reason: blockReason };
}

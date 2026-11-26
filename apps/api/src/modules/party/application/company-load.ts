import type { CreatePartyRequest } from '@arza/contracts';

import { recordAuditEvent } from '../../../platform/audit/audit-recorder.js';
import type { TenantTransaction } from '../../../platform/database/tenant-context.js';
import { bogotaToday, fromCalendarDate } from '../../core/index.js';
import { assertCatalogs, auditOf, columnsOf, duplicateOnConflict } from './party-fields.js';

// Terceros de la carga inicial (B45, decisión 1): solo organizaciones con NIT, como clientes o
// proveedores. Una organización no lleva autorización de tratamiento de datos (B17); las personas
// naturales se registran por pantalla. El alta deja el mismo evento «party.create» que la
// pantalla, con «source: import».

export interface CompanyLoadActor {
  readonly tenantId: string;
  readonly userId: string;
  readonly at: Date;
}

/** Ya hay un tercero con ese NIT (también fusionado o retirado): la carga no lo repite. */
export async function hasCompanyWithNit(tx: TenantTransaction, nit: string): Promise<boolean> {
  return (await tx.party.count({ where: { idType: 'NIT', idNumber: nit } })) > 0;
}

/** Registra la organización, ya validada con createPartyRequestSchema, con sus papeles. */
export async function addCompany(
  tx: TenantTransaction,
  actor: CompanyLoadActor,
  input: CreatePartyRequest,
): Promise<string> {
  await assertCatalogs(tx, input, null);
  const party = await tx.party
    .create({ data: { tenantId: actor.tenantId, ...columnsOf(input), status: input.status } })
    .catch(duplicateOnConflict);
  const roles = [...new Set(input.roles)];
  const since = fromCalendarDate(bogotaToday(actor.at));
  await tx.partyRole.createMany({
    data: roles.map((role) => ({ tenantId: actor.tenantId, partyId: party.id, role, since })),
  });
  await recordAuditEvent(tx, {
    tenantId: actor.tenantId,
    occurredAt: actor.at,
    actor: { kind: 'user', id: actor.userId },
    action: 'party.create',
    entityType: 'party',
    entityId: party.id,
    result: 'success',
    changes: { ...auditOf(party), roles, source: 'import' },
    meta: null,
  });
  return party.id;
}

import {
  partyKindSchema,
  partyRoleSchema,
  partyStatusSchema,
  type PartyRole,
  type PartySummary,
} from '@arza/contracts';

import type { Party, PartyRole as PartyRoleRow, Prisma } from '../../../generated/prisma/client.js';
import { hasUnconditionalPermission, type AppAbility } from '../../../platform/access/ability.js';
import type { Principal } from '../../../platform/access/principal.js';
import { recordAuditEvent } from '../../../platform/audit/audit-recorder.js';
import type { TenantTransaction } from '../../../platform/database/tenant-context.js';
import type { RequestMeta } from '../../../platform/http/request-meta.js';
import { partyNotFound } from './party-messages.js';

// Piezas comunes de los casos de uso de terceros (B13). Los valores de texto controlado se leen
// con el esquema del contrato; la base de datos ya los restringe con CHECK.

/** Quién escribe, desde dónde y cuándo. */
export interface PartyActor {
  readonly principal: Principal;
  readonly meta: RequestMeta;
  readonly at: Date;
}

export interface PartyChange {
  readonly action: string;
  readonly entityType: string;
  readonly entityId: string;
  readonly changes: Prisma.InputJsonObject;
}

/** Evento de auditoría de cada escritura, en la misma transacción (ADR-012). */
export async function auditParty(
  tx: TenantTransaction,
  actor: PartyActor,
  change: PartyChange,
): Promise<void> {
  await recordAuditEvent(tx, {
    tenantId: actor.principal.tenantId,
    occurredAt: actor.at,
    actor: { kind: 'user', id: actor.principal.userId },
    action: change.action,
    entityType: change.entityType,
    entityId: change.entityId,
    result: 'success',
    changes: change.changes,
    meta: actor.meta,
  });
}

/**
 * Qué terceros ve la persona. Con «solo lo propio» (equipo de proyecto, letra P) ve los que
 * registró. shortcut: cuando existan los proyectos (B26), sumar los clientes de sus proyectos.
 */
export interface PartyScope {
  readonly ownerId: string | null;
}

export const ALL_PARTIES: PartyScope = { ownerId: null };

export function scopeOf(principal: Principal, ability: AppAbility): PartyScope {
  return hasUnconditionalPermission(ability, 'party.read')
    ? ALL_PARTIES
    : { ownerId: principal.userId };
}

export function visibleParties(scope: PartyScope): Prisma.PartyWhereInput {
  return { deletedAt: null, ...(scope.ownerId === null ? {} : { createdBy: scope.ownerId }) };
}

/** El tercero, si existe, no se fusionó y la persona lo puede ver; si no, 404 (numeral 15.5). */
export async function findParty(
  tx: TenantTransaction,
  scope: PartyScope,
  id: string,
): Promise<Party> {
  const party = await tx.party.findFirst({ where: { id, ...visibleParties(scope) } });
  if (party === null) throw partyNotFound();
  return party;
}

/** Bloquea la fila del tercero hasta el fin de la transacción: serializa cambios que se cruzan. */
export async function lockParty(tx: TenantTransaction, id: string): Promise<void> {
  await tx.$queryRaw`SELECT id FROM pty_parties WHERE id = ${id}::uuid FOR UPDATE`;
}

export function partyName(party: Party): string {
  return party.kind === 'organization'
    ? (party.legalName ?? '')
    : `${party.firstName ?? ''} ${party.lastName ?? ''}`.trim();
}

function activeRoles(roles: readonly PartyRoleRow[]): PartyRole[] {
  return roles
    .filter((row) => row.status === 'active')
    .map((row) => partyRoleSchema.parse(row.role));
}

export function partySummaryView(party: Party, roles: readonly PartyRoleRow[]): PartySummary {
  return {
    id: party.id,
    kind: partyKindSchema.parse(party.kind),
    name: partyName(party),
    id_type: party.idType,
    id_number: party.idNumber,
    check_digit: party.checkDigit,
    email: party.email,
    phone: party.phone,
    city: party.city,
    status: partyStatusSchema.parse(party.status),
    roles: activeRoles(roles),
    version: party.version,
  };
}

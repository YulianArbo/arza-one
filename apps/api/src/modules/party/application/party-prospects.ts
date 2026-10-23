import { hasDocument } from '@arza/contracts';

import type { Party } from '../../../generated/prisma/client.js';
import { recordAuditEvent } from '../../../platform/audit/audit-recorder.js';
import type { TenantTransaction } from '../../../platform/database/tenant-context.js';
import type { RequestMeta } from '../../../platform/http/request-meta.js';
import { bogotaToday, fromCalendarDate } from '../../core/index.js';
import { partyName } from './party-support.js';

// Terceros para el CRM (B22): la persona de un prospecto se registra como tercero «prospecto», sin
// documento si no lo dio; al ganarle una oportunidad, el cliente queda activo y con el papel de
// cliente. El CRM llega aquí por el index.ts del módulo, dentro de su propia transacción.

/** Quién actúa: una persona con sesión o, desde el sitio público (B41), el sistema. */
export interface CommercialActor {
  readonly tenantId: string;
  readonly userId: string | null;
  readonly meta: RequestMeta | null;
  readonly at: Date;
}

export interface ProspectPerson {
  readonly firstName: string;
  readonly lastName: string;
  readonly email: string | null;
  readonly phone: string | null;
}

/** Un tercero como lo muestra el CRM. */
export interface CommercialParty {
  readonly id: string;
  readonly name: string;
  readonly kind: 'person' | 'organization';
  readonly email: string | null;
  readonly phone: string | null;
  /** Se puede usar en una oportunidad: no se retiró, no se fusionó y no está bloqueado. */
  readonly isUsable: boolean;
}

async function audit(
  tx: TenantTransaction,
  actor: CommercialActor,
  partyId: string,
  change: { readonly action: string; readonly changes: Record<string, string | null> },
): Promise<void> {
  await recordAuditEvent(tx, {
    tenantId: actor.tenantId,
    occurredAt: actor.at,
    actor: actor.userId === null ? { kind: 'system' } : { kind: 'user', id: actor.userId },
    action: change.action,
    entityType: 'party',
    entityId: partyId,
    result: 'success',
    changes: { ...change.changes, source: 'crm' },
    meta: actor.meta,
  });
}

/** Registra la persona de un prospecto como tercero «prospecto». Devuelve su id. */
export async function registerProspect(
  tx: TenantTransaction,
  actor: CommercialActor,
  person: ProspectPerson,
): Promise<string> {
  const party = await tx.party.create({
    data: {
      tenantId: actor.tenantId,
      kind: 'person',
      firstName: person.firstName,
      lastName: person.lastName,
      email: person.email,
      phone: person.phone === null ? null : person.phone.replaceAll(' ', ''),
      status: 'prospect',
    },
  });
  await audit(tx, actor, party.id, {
    action: 'party.create',
    changes: { kind: 'person', name: partyName(party), email: party.email, status: 'prospect' },
  });
  return party.id;
}

function commercialView(party: Party): CommercialParty {
  return {
    id: party.id,
    name: partyName(party),
    kind: party.kind === 'person' ? 'person' : 'organization',
    email: party.email,
    phone: party.phone,
    isUsable: party.deletedAt === null && party.status !== 'blocked',
  };
}

/** Los terceros indicados, también los retirados o fusionados, para mostrarlos. */
export async function commercialParties(
  tx: TenantTransaction,
  ids: readonly string[],
): Promise<Map<string, CommercialParty>> {
  if (ids.length === 0) return new Map();
  const rows = await tx.party.findMany({ where: { id: { in: [...new Set(ids)] } } });
  return new Map(rows.map((row) => [row.id, commercialView(row)]));
}

/** Terceros cuyo nombre o correo contiene el texto (como máximo 200), para buscar en el CRM. */
export async function matchingPartyIds(tx: TenantTransaction, q: string): Promise<string[]> {
  const contains = { contains: q, mode: 'insensitive' } as const;
  const rows = await tx.party.findMany({
    where: {
      OR: [
        { legalName: contains },
        { tradeName: contains },
        { firstName: contains },
        { lastName: contains },
        { email: contains },
      ],
    },
    select: { id: true },
    take: 200,
  });
  return rows.map((row) => row.id);
}

/**
 * El cliente de una oportunidad ganada queda activo y con el papel de cliente. Sin documento no
 * puede dejar de ser prospecto: devuelve falso y no cambia nada.
 */
export async function makeCustomer(
  tx: TenantTransaction,
  actor: CommercialActor,
  partyId: string,
): Promise<boolean> {
  const party = await tx.party.findFirst({ where: { id: partyId, deletedAt: null } });
  if (party === null) return false;
  const document = { id_type: party.idType, id_number: party.idNumber, check_digit: null };
  if (!hasDocument(document)) return false;
  if (party.status === 'prospect') {
    await tx.party.update({ where: { id: partyId }, data: { status: 'active' } });
    await audit(tx, actor, partyId, {
      action: 'party.status.change',
      changes: { from: 'prospect', to: 'active' },
    });
  }
  const role = await tx.partyRole.findFirst({ where: { partyId, role: 'customer' } });
  if (role?.status === 'active' && role.deletedAt === null) return true;
  const since = fromCalendarDate(bogotaToday(actor.at));
  await tx.partyRole.upsert({
    where: { tenantId_partyId_role: { tenantId: actor.tenantId, partyId, role: 'customer' } },
    create: { tenantId: actor.tenantId, partyId, role: 'customer', since },
    update: { status: 'active', since, deletedAt: null },
  });
  await audit(tx, actor, partyId, { action: 'party.role.add', changes: { role: 'customer' } });
  return true;
}

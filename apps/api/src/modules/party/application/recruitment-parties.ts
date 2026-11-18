import {
  createPartyRequestSchema,
  type CandidatePerson,
  type ConsentGrant,
  type CreatePartyRequest,
} from '@arza/contracts';

import type { Party } from '../../../generated/prisma/client.js';
import { recordAuditEvent } from '../../../platform/audit/audit-recorder.js';
import type { TenantTransaction } from '../../../platform/database/tenant-context.js';
import { bogotaToday, fromCalendarDate } from '../../core/index.js';
import { actorOf, grantConsent } from '../../privacy/index.js';
import { assertCatalogs, assertUniqueId, columnsOf, duplicateOnConflict } from './party-fields.js';
import { auditParty, type PartyActor } from './party-support.js';

/** Identidad de una persona registrada desde selección, con lo que muestra el expediente. */
export interface CandidatePartyRecord {
  readonly id: string;
  readonly firstName: string | null;
  readonly lastName: string | null;
  readonly email: string | null;
  readonly phone: string | null;
  readonly idType: string | null;
  readonly idNumber: string | null;
}

/** Autorizaciones que la persona ya dio dentro del expediente, por identificador. */
export interface CandidatePrivacy {
  readonly partyId: string;
  readonly consentId: string;
}

function consentInput(person: CandidatePerson, consent: ConsentGrant): CreatePartyRequest {
  return createPartyRequestSchema.parse({
    kind: 'person',
    status: 'active',
    ...person,
    roles: ['candidate'],
    consent,
  });
}

/** Crea el tercero con su papel de candidato; la autorización se guarda aparte. */
async function createCandidateParty(
  tx: TenantTransaction,
  actor: PartyActor,
  input: CreatePartyRequest,
): Promise<Party> {
  const { tenantId } = actor.principal;
  const party = await tx.party
    .create({ data: { tenantId, ...columnsOf(input), status: input.status } })
    .catch(duplicateOnConflict);
  await tx.partyRole.create({
    data: {
      tenantId,
      partyId: party.id,
      role: 'candidate',
      since: fromCalendarDate(bogotaToday(actor.at)),
    },
  });
  await auditParty(tx, actor, {
    action: 'party.create',
    entityType: 'party',
    entityId: party.id,
    changes: { kind: 'person', roles: ['candidate'] },
  });
  return party;
}

async function grantCandidateConsent(
  tx: TenantTransaction,
  actor: PartyActor,
  partyId: string,
  consent: ConsentGrant,
): Promise<string> {
  return grantConsent(tx, actorOf(actor.principal, actor.meta, actor.at), {
    partyId,
    grant: consent,
    source: 'hr_candidate',
  });
}

/** La persona vigente ya registrada con ese documento, si existe. */
async function existingPerson(tx: TenantTransaction, input: CreatePartyRequest) {
  if (input.id_type === null || input.id_number === null) return null;
  return tx.party.findFirst({
    where: {
      idType: input.id_type,
      idNumber: input.id_number,
      kind: 'person',
      deletedAt: null,
      mergedIntoId: null,
    },
    select: { id: true },
  });
}

/** Le agrega (o le devuelve) el papel de candidato a una persona que ya está en Terceros. */
async function ensureCandidateRole(
  tx: TenantTransaction,
  actor: PartyActor,
  partyId: string,
): Promise<void> {
  const { tenantId } = actor.principal;
  const since = fromCalendarDate(bogotaToday(actor.at));
  const role = await tx.partyRole.findFirst({ where: { partyId, role: 'candidate' } });
  if (role !== null && role.deletedAt === null && role.status === 'active') return;
  if (role === null) {
    await tx.partyRole.create({ data: { tenantId, partyId, role: 'candidate', since } });
  } else {
    await tx.partyRole.update({
      where: { id: role.id },
      data: { status: 'active', deletedAt: null, since },
    });
  }
  await auditParty(tx, actor, {
    action: 'party.role.add',
    entityType: 'party',
    entityId: partyId,
    changes: { role: 'candidate' },
  });
}

/**
 * Registra la persona y la autorización de selección dentro de la transacción de Talento Humano.
 * Si la persona ya está en Terceros con ese documento (otra candidatura, un contacto, un cliente),
 * se usa su ficha sin cambiar sus datos: solo gana el papel de candidato y la nueva autorización.
 */
export async function registerCandidateParty(
  tx: TenantTransaction,
  actor: PartyActor,
  person: CandidatePerson,
  consent: ConsentGrant,
): Promise<CandidatePrivacy> {
  const input = consentInput(person, consent);
  await assertCatalogs(tx, input, null);
  const existing = await existingPerson(tx, input);
  if (existing === null) await assertUniqueId(tx, input, null);
  const partyId =
    existing === null ? (await createCandidateParty(tx, actor, input)).id : existing.id;
  if (existing !== null) await ensureCandidateRole(tx, actor, partyId);
  const consentId = await grantCandidateConsent(tx, actor, partyId, consent);
  return { partyId, consentId };
}

/** Identidad referenciada desde el expediente de selección que autoriza Talento Humano. */
export async function candidateParties(
  tx: TenantTransaction,
  ids: readonly string[],
): Promise<Map<string, CandidatePartyRecord>> {
  const people = await tx.party.findMany({
    where: { id: { in: [...new Set(ids)] }, kind: 'person', deletedAt: null },
    select: {
      id: true,
      firstName: true,
      lastName: true,
      email: true,
      phone: true,
      idType: true,
      idNumber: true,
    },
  });
  return new Map(people.map((person) => [person.id, person]));
}

/** Condición de la identidad creada exclusivamente para selección. */
function erasableIdentity(tenantId: string, id: string) {
  return {
    tenantId,
    id,
    kind: 'person',
    deletedAt: null,
    mergedIntoId: null,
    roles: { some: { role: 'candidate' }, every: { role: 'candidate' } },
    mergedParties: { none: {} },
    contacts: { none: {} },
    contactOf: { none: {} },
    bankAccounts: { none: {} },
    dueDiligence: { none: {} },
  };
}

/** Datos que reemplazan la identidad al anonimizarla. */
function anonymizedIdentity(at: Date) {
  return {
    firstName: 'Candidato',
    lastName: 'Anonimizado',
    idType: null,
    idNumber: null,
    checkDigit: null,
    email: null,
    phone: null,
    city: null,
    address: null,
    status: 'prospect',
    statusReason: null,
    dataPurpose: null,
    dataAuthorization: null,
    dataAuthorizedOn: null,
    logoFileId: null,
    deletedAt: at,
  };
}

/** Borra la identidad creada exclusivamente para selección. Conserva terceros con otro uso. */
export async function eraseRecruitmentIdentity(
  tx: TenantTransaction,
  tenantId: string,
  id: string,
  at: Date,
): Promise<boolean> {
  const result = await tx.party.updateMany({
    where: erasableIdentity(tenantId, id),
    data: anonymizedIdentity(at),
  });
  if (result.count === 0) return false;
  await recordAuditEvent(tx, {
    tenantId,
    occurredAt: at,
    actor: { kind: 'system' },
    result: 'success',
    meta: null,
    action: 'party.recruitment.erase',
    entityType: 'party',
    entityId: id,
    changes: { erased: true },
  });
  return true;
}

/**
 * La persona también es cliente, proveedor, colaborador o contacto: su ficha se conserva y solo se
 * le quita el papel de candidato (decisión B del B35).
 */
export async function dropCandidateRole(
  tx: TenantTransaction,
  tenantId: string,
  partyId: string,
  at: Date,
): Promise<void> {
  const result = await tx.partyRole.updateMany({
    where: { tenantId, partyId, role: 'candidate', deletedAt: null },
    data: { status: 'ended', deletedAt: at },
  });
  if (result.count === 0) return;
  await recordAuditEvent(tx, {
    tenantId,
    occurredAt: at,
    actor: { kind: 'system' },
    result: 'success',
    meta: null,
    action: 'party.recruitment.role_remove',
    entityType: 'party',
    entityId: partyId,
    changes: { role: 'candidate', removed: true },
  });
}

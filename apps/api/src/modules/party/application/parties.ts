import { Inject, Injectable } from '@nestjs/common';
import {
  canChangeStatus,
  hasDocument,
  partyStatusSchema,
  type ChangePartyStatusRequest,
  type CreatePartyRequest,
  type PartyRole,
  type UpdatePartyRequest,
} from '@arza/contracts';

import { Prisma, type Party } from '../../../generated/prisma/client.js';
import type { Principal } from '../../../platform/access/principal.js';
import { changesBetween } from '../../../platform/audit/audit-recorder.js';
import { CLOCK, type Clock } from '../../../platform/clock/clock.js';
import { DatabaseService } from '../../../platform/database/database.service.js';
import type { TenantTransaction } from '../../../platform/database/tenant-context.js';
import { versionConflict } from '../../../platform/http/if-match.js';
import type { RequestMeta } from '../../../platform/http/request-meta.js';
import { bogotaToday, fromCalendarDate, isActiveCatalogCode } from '../../core/index.js';
import { actorOf, grantConsent } from '../../privacy/index.js';
import {
  catalogValueInvalid,
  kindChange,
  documentRequired,
  partyDuplicate,
  statusTransitionInvalid,
} from './party-messages.js';
import { ALL_PARTIES, auditParty, findParty, partyName, type PartyActor } from './party-support.js';

type PartyData = UpdatePartyRequest;

function documentOf(party: Party) {
  return { id_type: party.idType, id_number: party.idNumber, check_digit: party.checkDigit };
}

/**
 * Columnas del tercero a partir del formulario; el contrato ya exige los datos de cada tipo. El
 * teléfono se guarda sin espacios para encontrar duplicados.
 */
function columnsOf(input: PartyData) {
  return {
    kind: input.kind,
    idType: input.id_type,
    idNumber: input.id_number,
    checkDigit: input.check_digit,
    email: input.email,
    phone: input.phone === null ? null : input.phone.replaceAll(' ', ''),
    city: input.city,
    address: input.address,
    legalName: input.legal_name,
    tradeName: input.trade_name,
    firstName: input.first_name,
    lastName: input.last_name,
  };
}

/** Lo que guarda la auditoría: sin dirección ni teléfono completos, que no aportan al historial. */
function auditOf(party: Party) {
  return {
    kind: party.kind,
    name: partyName(party),
    id_type: party.idType,
    id_number: party.idNumber,
    email: party.email,
    city: party.city,
    status: party.status,
  };
}

/** El tipo de documento sigue activo en su catálogo; si no cambió, no se revisa. */
async function assertCatalogs(tx: TenantTransaction, input: PartyData, before: Party | null) {
  if (
    input.id_type !== null &&
    input.id_type !== before?.idType &&
    !(await isActiveCatalogCode(tx, 'identification_types', input.id_type))
  ) {
    throw catalogValueInvalid('El tipo de documento');
  }
}

/** Tipo y número de documento únicos por empresa, contando los fusionados (ficha 17.3). */
async function assertUniqueId(tx: TenantTransaction, input: PartyData, selfId: string | null) {
  if (input.id_type === null || input.id_number === null) return;
  const taken = await tx.party.count({
    where: {
      idType: input.id_type,
      idNumber: input.id_number,
      ...(selfId === null ? {} : { NOT: { id: selfId } }),
    },
  });
  if (taken > 0) throw partyDuplicate();
}

/** Dos registros simultáneos del mismo documento: decide el índice único y se responde 409. */
function duplicateOnConflict(error: unknown): never {
  if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
    throw partyDuplicate();
  }
  throw error;
}

/** Ficha, estado y papeles del tercero (ficha 17.3). */
@Injectable()
export class PartiesUseCase {
  constructor(
    @Inject(DatabaseService) private readonly database: DatabaseService,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  private actor(principal: Principal, meta: RequestMeta): PartyActor {
    return { principal, meta, at: this.clock.now() };
  }

  async create(
    principal: Principal,
    input: CreatePartyRequest,
    meta: RequestMeta,
  ): Promise<string> {
    const actor = this.actor(principal, meta);
    const since = fromCalendarDate(bogotaToday(actor.at));
    return this.database.withTenant(principal, async (tx) => {
      await assertCatalogs(tx, input, null);
      await assertUniqueId(tx, input, null);
      const party = await tx.party
        .create({
          data: { tenantId: principal.tenantId, ...columnsOf(input), status: input.status },
        })
        .catch(duplicateOnConflict);
      const roles = [...new Set(input.roles)];
      await tx.partyRole.createMany({
        data: roles.map((role) => ({
          tenantId: principal.tenantId,
          partyId: party.id,
          role,
          since,
        })),
      });
      await auditParty(tx, actor, {
        action: 'party.create',
        entityType: 'party',
        entityId: party.id,
        changes: { ...auditOf(party), roles },
      });
      // Ningún formulario con datos personales se guarda sin su autorización (B17).
      if (input.consent !== null) {
        await grantConsent(tx, actorOf(principal, meta, actor.at), {
          partyId: party.id,
          grant: input.consent,
          source: 'party_create',
        });
      }
      return party.id;
    });
  }

  async update(
    principal: Principal,
    target: { readonly id: string; readonly version: number },
    input: UpdatePartyRequest,
    meta: RequestMeta,
  ): Promise<void> {
    const actor = this.actor(principal, meta);
    await this.database.withTenant(principal, async (tx) => {
      const before = await findParty(tx, ALL_PARTIES, target.id);
      if (before.kind !== input.kind) throw kindChange();
      if (before.status !== 'prospect' && !hasDocument(input)) throw documentRequired();
      await assertCatalogs(tx, input, before);
      await assertUniqueId(tx, input, before.id);
      const { count } = await tx.party
        .updateMany({ where: { id: before.id, version: target.version }, data: columnsOf(input) })
        .catch(duplicateOnConflict);
      if (count === 0) throw versionConflict();
      const after = await findParty(tx, ALL_PARTIES, before.id);
      await auditParty(tx, actor, {
        action: 'party.update',
        entityType: 'party',
        entityId: before.id,
        changes: changesBetween(auditOf(before), auditOf(after)),
      });
    });
  }

  async changeStatus(
    principal: Principal,
    target: { readonly id: string; readonly version: number },
    input: ChangePartyStatusRequest,
    meta: RequestMeta,
  ): Promise<void> {
    const actor = this.actor(principal, meta);
    await this.database.withTenant(principal, async (tx) => {
      const party = await findParty(tx, ALL_PARTIES, target.id);
      if (!canChangeStatus(partyStatusSchema.parse(party.status), input.status)) {
        throw statusTransitionInvalid();
      }
      if (!hasDocument(documentOf(party))) throw documentRequired();
      const { count } = await tx.party.updateMany({
        where: { id: party.id, version: target.version },
        data: { status: input.status, statusReason: input.reason },
      });
      if (count === 0) throw versionConflict();
      await auditParty(tx, actor, {
        action: 'party.status.change',
        entityType: 'party',
        entityId: party.id,
        changes: { status: [party.status, input.status], reason: input.reason },
      });
    });
  }

  /** Agrega un papel, o reactiva uno que había terminado, desde hoy. Si ya está vigente, nada cambia. */
  async addRole(
    principal: Principal,
    id: string,
    role: PartyRole,
    meta: RequestMeta,
  ): Promise<void> {
    const actor = this.actor(principal, meta);
    const since = fromCalendarDate(bogotaToday(actor.at));
    await this.database.withTenant(principal, async (tx) => {
      await findParty(tx, ALL_PARTIES, id);
      const current = await tx.partyRole.findFirst({ where: { partyId: id, role } });
      if (current?.status === 'active' && current.deletedAt === null) return;
      await tx.partyRole.upsert({
        where: { tenantId_partyId_role: { tenantId: principal.tenantId, partyId: id, role } },
        create: { tenantId: principal.tenantId, partyId: id, role, since },
        update: { status: 'active', since, deletedAt: null },
      });
      await auditParty(tx, actor, {
        action: 'party.role.add',
        entityType: 'party',
        entityId: id,
        changes: { role },
      });
    });
  }

  /** Termina un papel; el historial lo conserva la auditoría. */
  async endRole(
    principal: Principal,
    id: string,
    role: PartyRole,
    meta: RequestMeta,
  ): Promise<void> {
    const actor = this.actor(principal, meta);
    await this.database.withTenant(principal, async (tx) => {
      await findParty(tx, ALL_PARTIES, id);
      const { count } = await tx.partyRole.updateMany({
        where: { partyId: id, role, status: 'active', deletedAt: null },
        data: { status: 'ended' },
      });
      if (count === 0) return;
      await auditParty(tx, actor, {
        action: 'party.role.end',
        entityType: 'party',
        entityId: id,
        changes: { role },
      });
    });
  }
}

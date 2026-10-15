import { Inject, Injectable } from '@nestjs/common';
import type {
  Contact as ContactView,
  CreateContactRequest,
  UpdateContactRequest,
} from '@arza/contracts';

import type { Contact, Party } from '../../../generated/prisma/client.js';
import type { AppAbility } from '../../../platform/access/ability.js';
import type { Principal } from '../../../platform/access/principal.js';
import { changesBetween } from '../../../platform/audit/audit-recorder.js';
import { CLOCK, type Clock } from '../../../platform/clock/clock.js';
import { DatabaseService } from '../../../platform/database/database.service.js';
import type { TenantTransaction } from '../../../platform/database/tenant-context.js';
import { versionConflict } from '../../../platform/http/if-match.js';
import type { RequestMeta } from '../../../platform/http/request-meta.js';
import { contactInvalid, partyNotFound } from './party-messages.js';
import {
  ALL_PARTIES,
  auditParty,
  findParty,
  lockParty,
  partyName,
  scopeOf,
  type PartyActor,
} from './party-support.js';

type ContactWithParties = Contact & { organization: Party; person: Party };

const WITH_PARTIES = { organization: true, person: true } as const;

function contactView(contact: ContactWithParties): ContactView {
  return {
    id: contact.id,
    organization: { id: contact.organizationId, name: partyName(contact.organization) },
    person: {
      id: contact.personId,
      name: partyName(contact.person),
      email: contact.person.email,
      phone: contact.person.phone,
    },
    job_title: contact.jobTitle,
    is_primary: contact.isPrimary,
    can_sign: contact.canSign,
    version: contact.version,
  };
}

function contactAudit(contact: Contact) {
  return {
    organization_id: contact.organizationId,
    person_id: contact.personId,
    job_title: contact.jobTitle,
    is_primary: contact.isPrimary,
    can_sign: contact.canSign,
  };
}

async function findOrganization(tx: TenantTransaction, id: string): Promise<Party> {
  const organization = await findParty(tx, ALL_PARTIES, id);
  if (organization.kind !== 'organization') {
    throw contactInvalid('Solo una organización tiene personas de contacto.');
  }
  return organization;
}

async function findContact(tx: TenantTransaction, organizationId: string, id: string) {
  const contact = await tx.contact.findFirst({ where: { id, organizationId, deletedAt: null } });
  if (contact === null) throw partyNotFound('El contacto');
  return contact;
}

/** Un solo contacto principal por organización: marcar uno desmarca a los demás. */
async function clearPrimary(tx: TenantTransaction, organizationId: string, keepId: string) {
  await tx.contact.updateMany({
    where: { organizationId, isPrimary: true, deletedAt: null, NOT: { id: keepId } },
    data: { isPrimary: false },
  });
}

interface ContactPair {
  readonly tenantId: string;
  readonly organizationId: string;
  readonly personId: string;
}

/**
 * Crea el contacto. Una persona que fue contacto y se retiró vuelve con la misma fila, para que
 * su historial siga unido.
 */
async function saveContact(
  tx: TenantTransaction,
  pair: ContactPair,
  input: CreateContactRequest,
): Promise<Contact> {
  const existing = await tx.contact.findFirst({
    where: { organizationId: pair.organizationId, personId: pair.personId },
  });
  if (existing !== null && existing.deletedAt === null) {
    throw contactInvalid('Esa persona ya es contacto de esta organización.');
  }
  const fields = {
    jobTitle: input.job_title,
    isPrimary: input.is_primary,
    canSign: input.can_sign,
  };
  return existing === null
    ? tx.contact.create({ data: { ...pair, ...fields } })
    : tx.contact.update({ where: { id: existing.id }, data: { ...fields, deletedAt: null } });
}

/** Contactos y firmantes autorizados de las organizaciones (ficha 17.3). */
@Injectable()
export class ContactsUseCase {
  constructor(
    @Inject(DatabaseService) private readonly database: DatabaseService,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  private actor(principal: Principal, meta: RequestMeta): PartyActor {
    return { principal, meta, at: this.clock.now() };
  }

  /** De una organización, sus contactos; de una persona, las organizaciones donde lo es. */
  async list(principal: Principal, ability: AppAbility, partyId: string): Promise<ContactView[]> {
    return this.database.withTenant(principal, async (tx) => {
      await findParty(tx, scopeOf(principal, ability), partyId);
      const contacts = await tx.contact.findMany({
        where: {
          deletedAt: null,
          OR: [{ organizationId: partyId }, { personId: partyId }],
          organization: { deletedAt: null },
          person: { deletedAt: null },
        },
        include: WITH_PARTIES,
        orderBy: [{ isPrimary: 'desc' }, { createdAt: 'asc' }],
      });
      return contacts.map(contactView);
    });
  }

  async create(
    principal: Principal,
    organizationId: string,
    input: CreateContactRequest,
    meta: RequestMeta,
  ): Promise<string> {
    const actor = this.actor(principal, meta);
    return this.database.withTenant(principal, async (tx) => {
      await findOrganization(tx, organizationId);
      const person = await findParty(tx, ALL_PARTIES, input.person_id);
      if (person.kind !== 'person') throw contactInvalid('El contacto debe ser una persona.');
      await lockParty(tx, organizationId);
      const contact = await saveContact(
        tx,
        { tenantId: principal.tenantId, organizationId, personId: person.id },
        input,
      );
      if (contact.isPrimary) await clearPrimary(tx, organizationId, contact.id);
      await auditParty(tx, actor, {
        action: 'party.contact.create',
        entityType: 'party_contact',
        entityId: contact.id,
        changes: contactAudit(contact),
      });
      return contact.id;
    });
  }

  async update(
    principal: Principal,
    organizationId: string,
    target: { readonly id: string; readonly version: number },
    input: UpdateContactRequest,
    meta: RequestMeta,
  ): Promise<void> {
    const actor = this.actor(principal, meta);
    await this.database.withTenant(principal, async (tx) => {
      await findOrganization(tx, organizationId);
      await lockParty(tx, organizationId);
      const before = await findContact(tx, organizationId, target.id);
      const { count } = await tx.contact.updateMany({
        where: { id: before.id, version: target.version },
        data: { jobTitle: input.job_title, isPrimary: input.is_primary, canSign: input.can_sign },
      });
      if (count === 0) throw versionConflict();
      if (input.is_primary) await clearPrimary(tx, organizationId, before.id);
      const after = await findContact(tx, organizationId, before.id);
      await auditParty(tx, actor, {
        action: 'party.contact.update',
        entityType: 'party_contact',
        entityId: before.id,
        changes: changesBetween(contactAudit(before), contactAudit(after)),
      });
    });
  }

  async remove(
    principal: Principal,
    organizationId: string,
    target: { readonly id: string; readonly version: number },
    meta: RequestMeta,
  ): Promise<void> {
    const actor = this.actor(principal, meta);
    await this.database.withTenant(principal, async (tx) => {
      await findOrganization(tx, organizationId);
      const contact = await findContact(tx, organizationId, target.id);
      const { count } = await tx.contact.updateMany({
        where: { id: contact.id, version: target.version },
        data: { deletedAt: actor.at, isPrimary: false },
      });
      if (count === 0) throw versionConflict();
      await auditParty(tx, actor, {
        action: 'party.contact.delete',
        entityType: 'party_contact',
        entityId: contact.id,
        changes: contactAudit(contact),
      });
    });
  }
}

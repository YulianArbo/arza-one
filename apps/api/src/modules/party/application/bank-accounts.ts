import { Inject, Injectable } from '@nestjs/common';
import {
  bankAccountStatusSchema,
  bankAccountTypeSchema,
  type BankAccount as BankAccountView,
  type CreateBankAccountRequest,
} from '@arza/contracts';
import { v7 as uuidv7 } from 'uuid';

import type { BankAccount } from '../../../generated/prisma/client.js';
import type { Principal } from '../../../platform/access/principal.js';
import { CLOCK, type Clock } from '../../../platform/clock/clock.js';
import { FieldCipher } from '../../../platform/crypto/field-cipher.js';
import { DatabaseService } from '../../../platform/database/database.service.js';
import type { TenantTransaction } from '../../../platform/database/tenant-context.js';
import type { RequestMeta } from '../../../platform/http/request-meta.js';
import { isActiveCatalogCode } from '../../core/index.js';
import { reviewProblem } from '../domain/reviews.js';
import { catalogValueInvalid, partyNotFound, reviewNotAllowed } from './party-messages.js';
import { ALL_PARTIES, auditParty, findParty, type PartyActor } from './party-support.js';
import { peopleOf, reviewFields, type People } from './review-views.js';

// Cuentas bancarias de terceros (ficha 17.3, numeral 12.4: dato restringido). El número se guarda
// cifrado y atado a su fila; la API solo entrega los cuatro últimos dígitos, salvo la consulta
// del número completo, que exige confirmar la identidad y queda registrada.

function cipherContext(tenantId: string, accountId: string): string {
  return `pty_bank_accounts:${tenantId}:${accountId}`;
}

function accountView(people: People, account: BankAccount): BankAccountView {
  return {
    id: account.id,
    bank: account.bank,
    account_type: bankAccountTypeSchema.parse(account.accountType),
    number_masked: `•••• ${account.accountLast4}`,
    status: bankAccountStatusSchema.parse(account.status),
    replaces_id: account.replacesId,
    ...reviewFields(people, account),
  };
}

/** Lo que la auditoría guarda de una cuenta: nunca el número. */
function accountAudit(account: BankAccount) {
  return {
    party_id: account.partyId,
    bank: account.bank,
    account_type: account.accountType,
    last4: account.accountLast4,
    status: account.status,
    replaces_id: account.replacesId,
  };
}

async function findAccount(tx: TenantTransaction, partyId: string, id: string) {
  const account = await tx.bankAccount.findFirst({ where: { id, partyId, deletedAt: null } });
  if (account === null) throw partyNotFound('La cuenta bancaria');
  return account;
}

/** La cuenta que se reemplaza es una aprobada del mismo tercero. */
async function assertReplaceable(tx: TenantTransaction, partyId: string, id: string | null) {
  if (id === null) return;
  const account = await findAccount(tx, partyId, id);
  if (account.status !== 'approved') throw partyNotFound('La cuenta aprobada que se reemplaza');
}

@Injectable()
export class BankAccountsUseCase {
  constructor(
    @Inject(DatabaseService) private readonly database: DatabaseService,
    @Inject(CLOCK) private readonly clock: Clock,
    @Inject(FieldCipher) private readonly cipher: FieldCipher,
  ) {}

  private actor(principal: Principal, meta: RequestMeta): PartyActor {
    return { principal, meta, at: this.clock.now() };
  }

  async list(principal: Principal, partyId: string): Promise<BankAccountView[]> {
    return this.database.withTenant(principal, async (tx) => {
      await findParty(tx, ALL_PARTIES, partyId);
      const accounts = await tx.bankAccount.findMany({
        where: { partyId, deletedAt: null },
        orderBy: { createdAt: 'desc' },
      });
      const people = await peopleOf(tx, accounts);
      return accounts.map((account) => accountView(people, account));
    });
  }

  /** Registra una cuenta pendiente; queda lista para pagos solo cuando otra persona la aprueba. */
  async create(
    principal: Principal,
    partyId: string,
    input: CreateBankAccountRequest,
    meta: RequestMeta,
  ): Promise<string> {
    const actor = this.actor(principal, meta);
    const id = uuidv7();
    const encrypted = this.cipher.encrypt(
      input.account_number,
      cipherContext(principal.tenantId, id),
    );
    return this.database.withTenant(principal, async (tx) => {
      await findParty(tx, ALL_PARTIES, partyId);
      if (!(await isActiveCatalogCode(tx, 'banks', input.bank))) {
        throw catalogValueInvalid('El banco');
      }
      await assertReplaceable(tx, partyId, input.replaces_id);
      const account = await tx.bankAccount.create({
        data: {
          id,
          tenantId: principal.tenantId,
          partyId,
          bank: input.bank,
          accountType: input.account_type,
          accountNumberEncrypted: encrypted,
          accountLast4: input.account_number.slice(-4),
          replacesId: input.replaces_id,
        },
      });
      await auditParty(tx, actor, {
        action: 'party.bank_account.create',
        entityType: 'party_bank_account',
        entityId: account.id,
        changes: accountAudit(account),
      });
      return account.id;
    });
  }

  async approve(
    principal: Principal,
    partyId: string,
    id: string,
    meta: RequestMeta,
  ): Promise<void> {
    await this.review(principal, { partyId, id, approved: true, note: null }, meta);
  }

  async reject(
    principal: Principal,
    partyId: string,
    id: string,
    note: string,
    meta: RequestMeta,
  ): Promise<void> {
    await this.review(principal, { partyId, id, approved: false, note }, meta);
  }

  /** Número completo, para verificarlo antes de aprobar o de pagar. La consulta se registra. */
  async reveal(
    principal: Principal,
    partyId: string,
    id: string,
    meta: RequestMeta,
  ): Promise<string> {
    const actor = this.actor(principal, meta);
    return this.database.withTenant(principal, async (tx) => {
      await findParty(tx, ALL_PARTIES, partyId);
      const account = await findAccount(tx, partyId, id);
      const accountNumber = this.cipher.decrypt(
        account.accountNumberEncrypted,
        cipherContext(principal.tenantId, account.id),
      );
      await auditParty(tx, actor, {
        action: 'party.bank_account.reveal',
        entityType: 'party_bank_account',
        entityId: account.id,
        changes: { party_id: partyId, last4: account.accountLast4 },
      });
      return accountNumber;
    });
  }

  private async review(
    principal: Principal,
    decision: { partyId: string; id: string; approved: boolean; note: string | null },
    meta: RequestMeta,
  ): Promise<void> {
    const actor = this.actor(principal, meta);
    await this.database.withTenant(principal, async (tx) => {
      await findParty(tx, ALL_PARTIES, decision.partyId);
      const account = await findAccount(tx, decision.partyId, decision.id);
      const problem = reviewProblem(account, principal.userId);
      if (problem !== null) throw reviewNotAllowed(problem);
      const status = decision.approved ? 'approved' : 'rejected';
      const reviewed = await tx.bankAccount.update({
        where: { id: account.id },
        data: {
          status,
          reviewedBy: principal.userId,
          reviewedAt: actor.at,
          reviewNote: decision.note,
        },
      });
      if (decision.approved && account.replacesId !== null) {
        await tx.bankAccount.updateMany({
          where: { id: account.replacesId, status: 'approved' },
          data: { status: 'replaced' },
        });
      }
      await auditParty(tx, actor, {
        action: `party.bank_account.${decision.approved ? 'approve' : 'reject'}`,
        entityType: 'party_bank_account',
        entityId: account.id,
        changes: { ...accountAudit(reviewed), note: decision.note },
      });
    });
  }
}

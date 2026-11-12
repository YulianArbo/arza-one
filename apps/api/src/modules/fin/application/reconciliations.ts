import { Inject, Injectable } from '@nestjs/common';
import {
  reconciliationItemSchema,
  type Reconciliation,
  type ReconciliationItem,
  type SaveReconciliation,
} from '@arza/contracts';
import { z } from 'zod';

import type { FinBankReconciliation } from '../../../generated/prisma/client.js';
import type { Principal } from '../../../platform/access/principal.js';
import { CLOCK, type Clock } from '../../../platform/clock/clock.js';
import { DatabaseService } from '../../../platform/database/database.service.js';
import type { TenantTransaction } from '../../../platform/database/tenant-context.js';
import { versionConflict } from '../../../platform/http/if-match.js';
import { Money, unexplainedDifference } from '../domain/ledger-rules.js';
import { recordInvalid, recordNotFound, statusInvalid } from './ledger-messages.js';
import { assertPeriodOpen, recordFinEvent, type FinActor } from './ledger-support.js';

// Conciliación bancaria (B32, decisión 7): por cuenta (nombre corto) y mes. Se guarda en borrador
// y se cierra solo cuando las partidas explican toda la diferencia entre libros y banco.

const ENTITY = 'fin_bank_reconciliation';
const itemsSchema = z.array(reconciliationItemSchema);

@Injectable()
export class ReconciliationsUseCase {
  constructor(
    @Inject(DatabaseService) private readonly database: DatabaseService,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  async list(principal: Principal): Promise<Reconciliation[]> {
    return this.database.withTenant(principal, async (tx) => {
      const rows = await tx.finBankReconciliation.findMany({
        where: { deletedAt: null },
        orderBy: [{ period: 'desc' }, { account: 'asc' }],
        take: 500,
      });
      return rows.map(viewOf);
    });
  }

  async create(actor: FinActor, input: SaveReconciliation): Promise<string> {
    const at = this.clock.now();
    return this.database.withTenant(actor.principal, async (tx) => {
      await assertPeriodOpen(tx, input.period);
      const taken = await tx.finBankReconciliation.count({
        where: { account: input.account, period: input.period, deletedAt: null },
      });
      if (taken > 0) {
        throw recordInvalid(
          'Ya existe la conciliación de esa cuenta en ese mes. Ábrala y edítela.',
        );
      }
      const row = await tx.finBankReconciliation.create({
        data: { tenantId: actor.principal.tenantId, ...columnsOf(input) },
      });
      await audit(tx, actor, at, row, 'finance.reconciliation.create', 'fin.reconciliation.saved', {
        ...changesOf(input),
        status: 'draft',
      });
      return row.id;
    });
  }

  async update(
    actor: FinActor,
    id: string,
    version: number,
    input: SaveReconciliation,
  ): Promise<void> {
    const at = this.clock.now();
    await this.database.withTenant(actor.principal, async (tx) => {
      const row = await findDraft(tx, id);
      await assertPeriodOpen(tx, row.period);
      await assertPeriodOpen(tx, input.period);
      const { count } = await tx.finBankReconciliation.updateMany({
        where: { id, version, status: 'draft', deletedAt: null },
        data: columnsOf(input),
      });
      if (count === 0) throw versionConflict();
      await audit(
        tx,
        actor,
        at,
        row,
        'finance.reconciliation.update',
        'fin.reconciliation.saved',
        changesOf(input),
      );
    });
  }

  async close(actor: FinActor, id: string, version: number): Promise<void> {
    const at = this.clock.now();
    await this.database.withTenant(actor.principal, async (tx) => {
      const row = await findDraft(tx, id);
      await assertPeriodOpen(tx, row.period);
      const unexplained = viewOf(row).unexplained;
      if (!new Money(unexplained).isZero()) {
        throw recordInvalid(
          `Falta explicar una diferencia de $ ${unexplained}. Agregue las partidas que la explican.`,
        );
      }
      const { count } = await tx.finBankReconciliation.updateMany({
        where: { id, version, status: 'draft', deletedAt: null },
        data: { status: 'reconciled', reconciledBy: actor.principal.userId, reconciledAt: at },
      });
      if (count === 0) throw versionConflict();
      await audit(tx, actor, at, row, 'finance.reconciliation.close', 'fin.reconciliation.closed', {
        status: ['draft', 'reconciled'],
      });
    });
  }
}

async function findDraft(tx: TenantTransaction, id: string): Promise<FinBankReconciliation> {
  const row = await tx.finBankReconciliation.findFirst({ where: { id, deletedAt: null } });
  if (row === null) throw recordNotFound('esa conciliación');
  if (row.status !== 'draft') throw statusInvalid('Esa conciliación ya está cerrada.');
  return row;
}

function columnsOf(input: SaveReconciliation) {
  return {
    account: input.account,
    period: input.period,
    bookBalance: input.book_balance,
    bankBalance: input.bank_balance,
    differences: input.differences.map((item) => ({
      description: item.description,
      amount: new Money(item.amount).toFixed(2),
    })),
  };
}

function changesOf(input: SaveReconciliation) {
  return {
    account: input.account,
    period: input.period,
    book_balance: input.book_balance,
    bank_balance: input.bank_balance,
    difference_count: input.differences.length,
  };
}

function viewOf(row: FinBankReconciliation): Reconciliation {
  const differences: ReconciliationItem[] = itemsSchema.parse(row.differences);
  const book = row.bookBalance.toFixed(2);
  const bank = row.bankBalance.toFixed(2);
  return {
    id: row.id,
    account: row.account,
    period: row.period,
    book_balance: book,
    bank_balance: bank,
    differences,
    unexplained: unexplainedDifference(book, bank, differences),
    status: row.status === 'reconciled' ? 'reconciled' : 'draft',
    version: row.version,
  };
}

async function audit(
  tx: TenantTransaction,
  actor: FinActor,
  at: Date,
  row: FinBankReconciliation,
  action: string,
  event: string,
  changes: Record<string, string | number | string[]>,
): Promise<void> {
  await recordFinEvent(tx, actor, at, {
    action,
    event,
    entityType: ENTITY,
    entityId: row.id,
    payload: { period: row.period },
    changes,
  });
}

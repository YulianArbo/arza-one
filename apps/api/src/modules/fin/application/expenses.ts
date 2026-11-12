import { Inject, Injectable } from '@nestjs/common';
import {
  EXPENSE_STATUS,
  type CreateExpense,
  type Expense,
  type FinanceOptions,
} from '@arza/contracts';

import type { FinExpense, Prisma } from '../../../generated/prisma/client.js';
import type { Principal } from '../../../platform/access/principal.js';
import { CLOCK, type Clock } from '../../../platform/clock/clock.js';
import { DatabaseService } from '../../../platform/database/database.service.js';
import type { TenantTransaction } from '../../../platform/database/tenant-context.js';
import { idempotencyKeyReused } from '../../../platform/http/idempotency-key.js';
import { versionConflict } from '../../../platform/http/if-match.js';
import {
  activeCostCenters,
  bogotaToday,
  catalogLabels,
  costCenterRefs,
  nextBusinessCode,
  toCalendarDate,
} from '../../core/index.js';
import { activeSuppliers, financeParties } from '../../party/index.js';
import { Money } from '../domain/ledger-rules.js';
import {
  recordInvalid,
  recordNotFound,
  segregationRequired,
  statusInvalid,
} from './ledger-messages.js';
import {
  CATEGORY_CATALOG,
  assertActiveCategory,
  assertActiveCostCenter,
  assertPeriodOpen,
  assertSupportFile,
  centerRef,
  dateColumn,
  recordFinEvent,
  type FinActor,
} from './ledger-support.js';

// Gastos con soporte (B32): se registran pendientes y otra persona los aprueba o los rechaza. El
// colaborador ve y registra solo los suyos.

const ENTITY = 'fin_expense';

@Injectable()
export class ExpensesUseCase {
  constructor(
    @Inject(DatabaseService) private readonly database: DatabaseService,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  /** Todos los gastos de la empresa (finance.ledger.read). */
  async list(principal: Principal): Promise<Expense[]> {
    return this.database.withTenant(principal, (tx) => expenseViews(tx, principal, {}));
  }

  /** Los gastos que registró la persona (finance.expense.manage, también solo lo propio). */
  async mine(principal: Principal): Promise<Expense[]> {
    return this.database.withTenant(principal, (tx) =>
      expenseViews(tx, principal, { createdBy: principal.userId }),
    );
  }

  async options(principal: Principal): Promise<FinanceOptions> {
    return this.database.withTenant(principal, async (tx) => {
      const [centers, labels, suppliers] = await Promise.all([
        activeCostCenters(tx),
        tx.catalogItem.findMany({
          where: { isActive: true, deletedAt: null, catalog: { key: CATEGORY_CATALOG } },
          orderBy: [{ sortOrder: 'asc' }, { label: 'asc' }],
          select: { code: true, label: true },
        }),
        activeSuppliers(tx),
      ]);
      return {
        cost_centers: centers,
        categories: labels,
        suppliers: suppliers.map((supplier) => ({ id: supplier.id, name: supplier.name })),
      };
    });
  }

  async create(actor: FinActor, key: string, input: CreateExpense): Promise<string> {
    const at = this.clock.now();
    return this.database.withTenant(actor.principal, async (tx) => {
      const prior = await tx.finExpense.findFirst({ where: { requestKey: key } });
      if (prior !== null) return sameExpense(prior, actor, input) ? prior.id : reuseKey();
      await validateExpense(tx, actor, input, bogotaToday(at));
      await assertPeriodOpen(tx, input.expense_date);
      const expense = await tx.finExpense.create({
        data: {
          tenantId: actor.principal.tenantId,
          code: await nextBusinessCode(tx, 'fin.expense', at, {
            name: 'Gastos',
            prefix: 'GAS',
            padding: 4,
          }),
          costCenterId: input.cost_center_id,
          supplierId: input.supplier_id,
          expenseDate: dateColumn(input.expense_date),
          amount: input.amount,
          category: input.category,
          description: input.description,
          supportFileId: input.support_file_id,
          requestKey: key,
          createdBy: actor.principal.userId,
        },
      });
      await record(tx, actor, at, expense, 'finance.expense.create', 'fin.expense.registered', {
        amount: input.amount,
        expense_date: input.expense_date,
        category: input.category,
        cost_center_id: input.cost_center_id,
        status: 'pending',
      });
      return expense.id;
    });
  }

  async approve(actor: FinActor, id: string, version: number): Promise<void> {
    await this.decide(actor, id, version, 'approved', null);
  }

  async reject(actor: FinActor, id: string, version: number, reason: string): Promise<void> {
    await this.decide(actor, id, version, 'rejected', reason);
  }

  private async decide(
    actor: FinActor,
    id: string,
    version: number,
    status: 'approved' | 'rejected',
    note: string | null,
  ): Promise<void> {
    const at = this.clock.now();
    await this.database.withTenant(actor.principal, async (tx) => {
      const expense = await tx.finExpense.findFirst({ where: { id, deletedAt: null } });
      if (expense === null) throw recordNotFound('ese gasto');
      if (expense.status !== 'pending') throw statusInvalid('Ese gasto ya fue decidido.');
      if (expense.createdBy === actor.principal.userId) throw segregationRequired('El gasto');
      await assertPeriodOpen(tx, expense.expenseDate);
      const { count } = await tx.finExpense.updateMany({
        where: { id, version, status: 'pending', deletedAt: null },
        data: { status, decidedBy: actor.principal.userId, decidedAt: at, decisionNote: note },
      });
      if (count === 0) throw versionConflict();
      const action = status === 'approved' ? 'approve' : 'reject';
      await record(tx, actor, at, expense, `finance.expense.${action}`, `fin.expense.${status}`, {
        status: ['pending', status],
        ...(note === null ? {} : { reason: note }),
      });
    });
  }
}

function reuseKey(): never {
  throw idempotencyKeyReused();
}

function sameExpense(prior: FinExpense, actor: FinActor, input: CreateExpense): boolean {
  return (
    prior.createdBy === actor.principal.userId &&
    prior.amount.toFixed(2) === new Money(input.amount).toFixed(2) &&
    toCalendarDate(prior.expenseDate) === input.expense_date
  );
}

async function validateExpense(
  tx: TenantTransaction,
  actor: FinActor,
  input: CreateExpense,
  today: string,
): Promise<void> {
  await assertActiveCostCenter(tx, input.cost_center_id);
  await assertActiveCategory(tx, input.category);
  await assertSupportFile(tx, actor, input.support_file_id);
  if (input.expense_date > today) {
    throw recordInvalid('La fecha del gasto no puede ser posterior a hoy.');
  }
  if (input.supplier_id !== null) {
    const suppliers = await activeSuppliers(tx);
    if (!suppliers.some((supplier) => supplier.id === input.supplier_id)) {
      throw recordInvalid('Elija un proveedor vigente.');
    }
  }
}

async function record(
  tx: TenantTransaction,
  actor: FinActor,
  at: Date,
  expense: FinExpense,
  action: string,
  event: string,
  changes: Prisma.InputJsonObject,
): Promise<void> {
  await recordFinEvent(tx, actor, at, {
    action,
    event,
    entityType: ENTITY,
    entityId: expense.id,
    payload: { code: expense.code },
    changes,
  });
}

interface ExpenseRefs {
  readonly centers: Awaited<ReturnType<typeof costCenterRefs>>;
  readonly labels: Map<string, string>;
  readonly parties: Awaited<ReturnType<typeof financeParties>>;
}

async function expenseViews(
  tx: TenantTransaction,
  principal: Principal,
  where: Prisma.FinExpenseWhereInput,
): Promise<Expense[]> {
  const expenses = await tx.finExpense.findMany({
    where: { ...where, deletedAt: null },
    orderBy: [{ expenseDate: 'desc' }, { code: 'desc' }],
    take: 500,
  });
  const [centers, labels, parties] = await Promise.all([
    costCenterRefs(
      tx,
      expenses.map((expense) => expense.costCenterId),
    ),
    catalogLabels(tx, CATEGORY_CATALOG),
    financeParties(
      tx,
      expenses.flatMap((expense) => (expense.supplierId === null ? [] : [expense.supplierId])),
    ),
  ]);
  return expenses.map((expense) => expenseView(expense, { centers, labels, parties }, principal));
}

function expenseView(expense: FinExpense, refs: ExpenseRefs, principal: Principal): Expense {
  const supplier = expense.supplierId === null ? undefined : refs.parties.get(expense.supplierId);
  return {
    id: expense.id,
    code: expense.code,
    expense_date: toCalendarDate(expense.expenseDate),
    amount: expense.amount.toFixed(2),
    category: {
      code: expense.category,
      label: refs.labels.get(expense.category) ?? expense.category,
    },
    cost_center: centerRef(refs.centers, expense.costCenterId),
    supplier: supplier === undefined ? null : { id: supplier.id, name: supplier.name },
    description: expense.description,
    support_file_id: expense.supportFileId,
    status: EXPENSE_STATUS.find((status) => status === expense.status) ?? 'pending',
    decision_note: expense.decisionNote,
    mine: expense.createdBy === principal.userId,
    version: expense.version,
  };
}

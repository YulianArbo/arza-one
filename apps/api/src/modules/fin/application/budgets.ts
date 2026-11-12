import { Inject, Injectable } from '@nestjs/common';
import type {
  BudgetDetail,
  BudgetExecution,
  BudgetSummary,
  ReplaceBudgetLines,
} from '@arza/contracts';

import type { FinBudget, FinBudgetLine } from '../../../generated/prisma/client.js';
import type { Principal } from '../../../platform/access/principal.js';
import { CLOCK, type Clock } from '../../../platform/clock/clock.js';
import { DatabaseService } from '../../../platform/database/database.service.js';
import type { TenantTransaction } from '../../../platform/database/tenant-context.js';
import { versionConflict } from '../../../platform/http/if-match.js';
import { catalogLabels, costCenterRefs } from '../../core/index.js';
import { Money } from '../domain/ledger-rules.js';
import { budgetExecution } from './budget-execution.js';
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
  recordFinEvent,
  type FinActor,
} from './ledger-support.js';

// Presupuesto por centro de costo (B32): uno por año; se elabora en borrador, lo aprueba otra
// persona y desde ahí no se edita.

const ENTITY = 'fin_budget';

@Injectable()
export class BudgetsUseCase {
  constructor(
    @Inject(DatabaseService) private readonly database: DatabaseService,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  async list(principal: Principal): Promise<BudgetSummary[]> {
    return this.database.withTenant(principal, async (tx) => {
      const budgets = await tx.finBudget.findMany({
        where: { deletedAt: null },
        orderBy: { year: 'desc' },
        include: { lines: { where: { deletedAt: null }, select: { planned: true } } },
      });
      return budgets.map((budget) => summaryOf(budget, budget.lines, principal));
    });
  }

  async detail(principal: Principal, id: string): Promise<BudgetDetail> {
    return this.database.withTenant(principal, async (tx) => {
      const budget = await findBudget(tx, id);
      const lines = await activeLines(tx, id);
      const [centers, labels] = await Promise.all([
        costCenterRefs(
          tx,
          lines.map((line) => line.costCenterId),
        ),
        catalogLabels(tx, CATEGORY_CATALOG),
      ]);
      return {
        ...summaryOf(budget, lines, principal),
        lines: lines.map((line) => {
          const center = centers.get(line.costCenterId);
          return {
            id: line.id,
            cost_center: {
              id: line.costCenterId,
              code: center?.code ?? '—',
              name: center?.name ?? 'Centro de costo',
            },
            category: { code: line.category, label: labels.get(line.category) ?? line.category },
            month: line.month,
            planned: line.planned.toFixed(2),
          };
        }),
      };
    });
  }

  async execution(principal: Principal, id: string): Promise<BudgetExecution> {
    return this.database.withTenant(principal, async (tx) => {
      const budget = await findBudget(tx, id);
      return budgetExecution(tx, budget.year, await activeLines(tx, id));
    });
  }

  async create(actor: FinActor, year: number): Promise<string> {
    const at = this.clock.now();
    return this.database.withTenant(actor.principal, async (tx) => {
      const taken = await tx.finBudget.count({ where: { year, deletedAt: null } });
      if (taken > 0) throw recordInvalid(`Ya existe el presupuesto de ${String(year)}.`);
      const budget = await tx.finBudget.create({
        data: { tenantId: actor.principal.tenantId, year, createdBy: actor.principal.userId },
      });
      await recordFinEvent(tx, actor, at, {
        action: 'finance.budget.create',
        event: 'fin.budget.created',
        entityType: ENTITY,
        entityId: budget.id,
        payload: { year },
        changes: { year, status: 'draft' },
      });
      return budget.id;
    });
  }

  async replaceLines(
    actor: FinActor,
    id: string,
    version: number,
    input: ReplaceBudgetLines,
  ): Promise<void> {
    const at = this.clock.now();
    await this.database.withTenant(actor.principal, async (tx) => {
      const budget = await findBudget(tx, id);
      if (budget.status !== 'draft') {
        throw statusInvalid('Un presupuesto aprobado ya no se edita.');
      }
      await validateLines(tx, input);
      const { count } = await tx.finBudget.updateMany({
        where: { id, version, status: 'draft', deletedAt: null },
        data: { updatedBy: actor.principal.userId },
      });
      if (count === 0) throw versionConflict();
      await writeLines(tx, actor, id, input, at);
      await recordFinEvent(tx, actor, at, {
        action: 'finance.budget.update',
        event: 'fin.budget.updated',
        entityType: ENTITY,
        entityId: id,
        payload: { year: budget.year },
        changes: { line_count: input.lines.length, planned_total: plannedTotal(input.lines) },
      });
    });
  }

  async approve(actor: FinActor, id: string, version: number): Promise<void> {
    const at = this.clock.now();
    await this.database.withTenant(actor.principal, async (tx) => {
      const budget = await findBudget(tx, id);
      if (budget.status !== 'draft') throw statusInvalid('Ese presupuesto ya está aprobado.');
      if (budget.createdBy === actor.principal.userId) throw segregationRequired('El presupuesto');
      if ((await activeLines(tx, id)).length === 0) {
        throw recordInvalid('Agregue al menos una línea antes de aprobar el presupuesto.');
      }
      const { count } = await tx.finBudget.updateMany({
        where: { id, version, status: 'draft', deletedAt: null },
        data: { status: 'approved', approvedBy: actor.principal.userId, approvedAt: at },
      });
      if (count === 0) throw versionConflict();
      await recordFinEvent(tx, actor, at, {
        action: 'finance.budget.approve',
        event: 'fin.budget.approved',
        entityType: ENTITY,
        entityId: id,
        payload: { year: budget.year },
        changes: { status: ['draft', 'approved'] },
      });
    });
  }
}

async function findBudget(tx: TenantTransaction, id: string): Promise<FinBudget> {
  const budget = await tx.finBudget.findFirst({ where: { id, deletedAt: null } });
  if (budget === null) throw recordNotFound('ese presupuesto');
  return budget;
}

/** Las líneas anteriores se marcan como borradas y las nuevas las reemplazan. */
async function writeLines(
  tx: TenantTransaction,
  actor: FinActor,
  budgetId: string,
  input: ReplaceBudgetLines,
  at: Date,
): Promise<void> {
  await tx.finBudgetLine.updateMany({
    where: { budgetId, deletedAt: null },
    data: { deletedAt: at },
  });
  await tx.finBudgetLine.createMany({
    data: input.lines.map((line) => ({
      tenantId: actor.principal.tenantId,
      budgetId,
      costCenterId: line.cost_center_id,
      category: line.category,
      month: line.month,
      planned: line.planned,
    })),
  });
}

function activeLines(tx: TenantTransaction, budgetId: string): Promise<FinBudgetLine[]> {
  return tx.finBudgetLine.findMany({
    where: { budgetId, deletedAt: null },
    orderBy: [{ costCenterId: 'asc' }, { category: 'asc' }, { month: 'asc' }],
  });
}

async function validateLines(tx: TenantTransaction, input: ReplaceBudgetLines): Promise<void> {
  for (const center of new Set(input.lines.map((line) => line.cost_center_id))) {
    await assertActiveCostCenter(tx, center);
  }
  for (const category of new Set(input.lines.map((line) => line.category))) {
    await assertActiveCategory(tx, category);
  }
}

function plannedTotal(lines: readonly { readonly planned: { toString(): string } }[]): string {
  return lines.reduce((sum, line) => sum.plus(line.planned.toString()), new Money(0)).toFixed(2);
}

function summaryOf(
  budget: FinBudget,
  lines: readonly { readonly planned: { toString(): string } }[],
  principal: Principal,
): BudgetSummary {
  return {
    id: budget.id,
    year: budget.year,
    status: budget.status === 'approved' ? 'approved' : 'draft',
    planned_total: plannedTotal(lines),
    line_count: lines.length,
    mine: budget.createdBy === principal.userId,
    approved_at: budget.approvedAt?.toISOString() ?? null,
    version: budget.version,
  };
}

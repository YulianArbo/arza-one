import { Inject, Injectable } from '@nestjs/common';
import {
  PETTY_CASH_TYPES,
  type CreatePettyCashMovement,
  type PettyCashMovement,
  type PettyCashResponse,
} from '@arza/contracts';

import type { FinPettyCash } from '../../../generated/prisma/client.js';
import type { Principal } from '../../../platform/access/principal.js';
import { CLOCK, type Clock } from '../../../platform/clock/clock.js';
import { DatabaseService } from '../../../platform/database/database.service.js';
import type { TenantTransaction } from '../../../platform/database/tenant-context.js';
import { idempotencyKeyReused } from '../../../platform/http/idempotency-key.js';
import {
  bogotaToday,
  catalogLabels,
  costCenterRefs,
  nextBusinessCode,
  toCalendarDate,
} from '../../core/index.js';
import {
  Money,
  pettyCashBalanceAfter,
  type PettyCashProblem,
  type PettyCashState,
} from '../domain/ledger-rules.js';
import { recordInvalid } from './ledger-messages.js';
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

// Caja menor (B32, decisión 7): una por empresa. Libro de movimientos con el saldo de cada uno;
// el saldo nunca es negativo ni pasa del fondo abierto. El arqueo queda para más adelante.

const PROBLEMS: Readonly<Record<PettyCashProblem, string>> = {
  already_open: 'La caja menor ya está abierta. Para reponerla registre un reembolso.',
  not_open: 'Abra primero la caja menor con el valor del fondo.',
  insufficient_balance: 'El vale supera el saldo de la caja menor. Registre antes un reembolso.',
  over_fund: 'El reembolso dejaría la caja con más dinero que el fondo abierto.',
  date_before_last: 'La fecha no puede ser anterior a la del último movimiento de la caja.',
};

const TYPE_TEXT = { opening: 'Apertura', voucher: 'Vale', replenishment: 'Reembolso' } as const;

@Injectable()
export class PettyCashUseCase {
  constructor(
    @Inject(DatabaseService) private readonly database: DatabaseService,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  async ledger(principal: Principal): Promise<PettyCashResponse['data']> {
    return this.database.withTenant(principal, async (tx) => {
      const movements = await tx.finPettyCash.findMany({
        where: { deletedAt: null },
        orderBy: [{ movementDate: 'desc' }, { createdAt: 'desc' }],
        take: 500,
      });
      const [state, centers, labels] = await Promise.all([
        currentState(tx),
        costCenterRefs(
          tx,
          movements.flatMap((row) => (row.costCenterId === null ? [] : [row.costCenterId])),
        ),
        catalogLabels(tx, CATEGORY_CATALOG),
      ]);
      return {
        fund: state.fund,
        balance: state.balance,
        movements: movements.map((row) => movementView(row, centers, labels)),
      };
    });
  }

  async register(actor: FinActor, key: string, input: CreatePettyCashMovement): Promise<string> {
    const at = this.clock.now();
    return this.database.withTenant(actor.principal, async (tx) => {
      const prior = await tx.finPettyCash.findFirst({ where: { requestKey: key } });
      if (prior !== null) return samePrior(prior, input) ? prior.id : reuseKey();
      await validateMovement(tx, actor, input, bogotaToday(at));
      await assertPeriodOpen(tx, input.movement_date);
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(core_current_tenant_id()::text || 'fin.petty_cash', 0))`;
      const next = pettyCashBalanceAfter(await currentState(tx), {
        type: input.type,
        amount: input.amount,
        date: input.movement_date,
      });
      if ('problem' in next) throw recordInvalid(PROBLEMS[next.problem]);
      const movement = await insertMovement(tx, actor, key, input, next.balance, at);
      await recordFinEvent(tx, actor, at, {
        action: 'finance.petty_cash.register',
        event: 'fin.petty_cash.registered',
        entityType: 'fin_petty_cash',
        entityId: movement.id,
        payload: { code: movement.code, type: input.type },
        changes: {
          type: TYPE_TEXT[input.type],
          amount: input.amount,
          movement_date: input.movement_date,
          balance: next.balance,
        },
      });
      return movement.id;
    });
  }
}

async function insertMovement(
  tx: TenantTransaction,
  actor: FinActor,
  key: string,
  input: CreatePettyCashMovement,
  balance: string,
  at: Date,
): Promise<FinPettyCash> {
  return tx.finPettyCash.create({
    data: {
      tenantId: actor.principal.tenantId,
      code: await nextBusinessCode(tx, 'fin.petty_cash', at, {
        name: 'Caja menor',
        prefix: 'CM',
        padding: 4,
      }),
      movementDate: dateColumn(input.movement_date),
      type: input.type,
      amount: input.amount,
      concept: input.concept,
      costCenterId: input.cost_center_id,
      category: input.category,
      supportFileId: input.support_file_id,
      balance,
      requestKey: key,
      createdBy: actor.principal.userId,
    },
  });
}

function movementView(
  row: FinPettyCash,
  centers: Awaited<ReturnType<typeof costCenterRefs>>,
  labels: Map<string, string>,
): PettyCashMovement {
  return {
    id: row.id,
    code: row.code,
    movement_date: toCalendarDate(row.movementDate),
    type: PETTY_CASH_TYPES.find((type) => type === row.type) ?? 'voucher',
    amount: row.amount.toFixed(2),
    concept: row.concept,
    cost_center: row.costCenterId === null ? null : centerRef(centers, row.costCenterId),
    category:
      row.category === null
        ? null
        : { code: row.category, label: labels.get(row.category) ?? row.category },
    support_file_id: row.supportFileId,
    balance: row.balance.toFixed(2),
  };
}

function reuseKey(): never {
  throw idempotencyKeyReused();
}

function samePrior(prior: FinPettyCash, input: CreatePettyCashMovement): boolean {
  return (
    prior.type === input.type && prior.amount.toFixed(2) === new Money(input.amount).toFixed(2)
  );
}

async function currentState(tx: TenantTransaction): Promise<PettyCashState> {
  const [opening, last] = await Promise.all([
    tx.finPettyCash.findFirst({ where: { type: 'opening', deletedAt: null } }),
    tx.finPettyCash.findFirst({
      where: { deletedAt: null },
      orderBy: [{ movementDate: 'desc' }, { createdAt: 'desc' }],
    }),
  ]);
  return {
    fund: opening?.amount.toFixed(2) ?? null,
    balance: last?.balance.toFixed(2) ?? '0.00',
    lastDate: last === null ? null : toCalendarDate(last.movementDate),
  };
}

async function validateMovement(
  tx: TenantTransaction,
  actor: FinActor,
  input: CreatePettyCashMovement,
  today: string,
): Promise<void> {
  if (input.movement_date > today) {
    throw recordInvalid('La fecha del movimiento no puede ser posterior a hoy.');
  }
  if (input.cost_center_id !== null) await assertActiveCostCenter(tx, input.cost_center_id);
  if (input.category !== null) await assertActiveCategory(tx, input.category);
  if (input.support_file_id !== null) await assertSupportFile(tx, actor, input.support_file_id);
}

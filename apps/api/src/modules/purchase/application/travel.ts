import { Inject, Injectable } from '@nestjs/common';
import {
  travelBalance,
  type AddTravelExpense,
  type SaveTravelRequest,
  type TravelRequest,
} from '@arza/contracts';

import type { Principal } from '../../../platform/access/principal.js';
import { CLOCK, type Clock } from '../../../platform/clock/clock.js';
import { DatabaseService } from '../../../platform/database/database.service.js';
import { bogotaToday, nextBusinessCode } from '../../core/index.js';
import {
  recordInvalid,
  recordNotFound,
  segregationRequired,
  statusInvalid,
} from './purchase-messages.js';
import { assertOwnFile, type PurActor } from './purchase-support.js';
import {
  changeTravel,
  findTravel,
  ownTravel,
  recordTravel,
  reuseKey,
  sameTravel,
  travelData,
  travelToLegalize,
} from './travel-support.js';
import { travelViews } from './travel-views.js';

// Viajes (B33, FT-ADM-003 y FT-ADM-004): el viajero pide el viaje con su anticipo, otra persona lo
// aprueba y, desde el día de salida, el viajero registra sus gastos con soporte y lo legaliza. El
// saldo (anticipo menos gastos) se informa; no crea movimientos en Finanzas (decisión 7).

@Injectable()
export class TravelUseCase {
  constructor(
    @Inject(DatabaseService) private readonly database: DatabaseService,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  /** Todos los viajes de la empresa (purchase.read). */
  async list(principal: Principal): Promise<TravelRequest[]> {
    return this.database.withTenant(principal, (tx) => travelViews(tx, principal, {}));
  }

  /** Los viajes de la persona (purchase.travel.request, también solo lo propio). */
  async mine(principal: Principal): Promise<TravelRequest[]> {
    return this.database.withTenant(principal, (tx) =>
      travelViews(tx, principal, { travelerId: principal.userId }),
    );
  }

  async create(actor: PurActor, key: string, input: SaveTravelRequest): Promise<string> {
    const at = this.clock.now();
    return this.database.withTenant(actor.principal, async (tx) => {
      const prior = await tx.purTravelRequest.findFirst({ where: { requestKey: key } });
      if (prior !== null) return sameTravel(prior, actor, input) ? prior.id : reuseKey();
      const travel = await tx.purTravelRequest.create({
        data: {
          tenantId: actor.principal.tenantId,
          code: await nextBusinessCode(tx, 'pur.travel', at, {
            name: 'Solicitudes de viaje',
            prefix: 'SV',
            padding: 4,
          }),
          travelerId: actor.principal.userId,
          ...travelData(input),
          requestKey: key,
          createdBy: actor.principal.userId,
        },
      });
      await recordTravel(tx, actor, at, travel, 'create', 'created', {
        starts_on: input.starts_on,
        ends_on: input.ends_on,
        advance_amount: input.advance_amount,
        status: 'draft',
      });
      return travel.id;
    });
  }

  async update(
    actor: PurActor,
    id: string,
    version: number,
    input: SaveTravelRequest,
  ): Promise<void> {
    const at = this.clock.now();
    await this.database.withTenant(actor.principal, async (tx) => {
      const travel = await ownTravel(tx, actor, id, 'draft');
      await changeTravel(
        tx,
        { id, version, status: 'draft' },
        {
          ...travelData(input),
          updatedBy: actor.principal.userId,
        },
      );
      await recordTravel(tx, actor, at, travel, 'update', 'updated', {
        advance_amount: [travel.advanceAmount.toFixed(2), input.advance_amount],
      });
    });
  }

  async submit(actor: PurActor, id: string, version: number): Promise<void> {
    const at = this.clock.now();
    await this.database.withTenant(actor.principal, async (tx) => {
      const travel = await ownTravel(tx, actor, id, 'draft');
      await changeTravel(
        tx,
        { id, version, status: 'draft' },
        {
          status: 'in_approval',
          submittedAt: at,
          updatedBy: actor.principal.userId,
        },
      );
      await recordTravel(tx, actor, at, travel, 'submit', 'submitted', {
        status: ['draft', 'in_approval'],
      });
    });
  }

  async approve(actor: PurActor, id: string, version: number): Promise<void> {
    await this.decide(actor, id, version, 'approved', null);
  }

  async reject(actor: PurActor, id: string, version: number, reason: string): Promise<void> {
    await this.decide(actor, id, version, 'rejected', reason);
  }

  private async decide(
    actor: PurActor,
    id: string,
    version: number,
    status: 'approved' | 'rejected',
    note: string | null,
  ): Promise<void> {
    const at = this.clock.now();
    await this.database.withTenant(actor.principal, async (tx) => {
      const travel = await findTravel(tx, id);
      if (travel.status !== 'in_approval') throw statusInvalid('Ese viaje no está en aprobación.');
      if (travel.travelerId === actor.principal.userId) {
        throw segregationRequired('El viaje lo aprueba una persona distinta del viajero.');
      }
      await changeTravel(
        tx,
        { id, version, status: 'in_approval' },
        {
          status,
          decidedBy: actor.principal.userId,
          decidedAt: at,
          decisionNote: note,
        },
      );
      const action = status === 'approved' ? 'approve' : 'reject';
      await recordTravel(tx, actor, at, travel, action, status, {
        status: ['in_approval', status],
        ...(note === null ? {} : { reason: note }),
      });
    });
  }

  async addExpense(
    actor: PurActor,
    id: string,
    key: string,
    input: AddTravelExpense,
  ): Promise<string> {
    const at = this.clock.now();
    return this.database.withTenant(actor.principal, async (tx) => {
      const prior = await tx.purTravelExpense.findFirst({ where: { requestKey: key } });
      if (prior !== null) return prior.travelRequestId === id ? prior.id : reuseKey();
      const travel = await travelToLegalize(tx, actor, id, bogotaToday(at));
      await assertOwnFile(tx, actor, input.support_file_id);
      const expense = await tx.purTravelExpense.create({
        data: {
          tenantId: actor.principal.tenantId,
          travelRequestId: id,
          concept: input.concept,
          amount: input.amount,
          supportFileId: input.support_file_id,
          requestKey: key,
          createdBy: actor.principal.userId,
        },
      });
      await recordTravel(tx, actor, at, travel, 'expense.add', 'expense.added', {
        expense_id: expense.id,
        amount: input.amount,
      });
      return expense.id;
    });
  }

  async removeExpense(actor: PurActor, expenseId: string): Promise<void> {
    const at = this.clock.now();
    await this.database.withTenant(actor.principal, async (tx) => {
      const expense = await tx.purTravelExpense.findFirst({
        where: { id: expenseId, deletedAt: null },
      });
      if (expense === null) throw recordNotFound('ese gasto de viaje');
      const travel = await travelToLegalize(tx, actor, expense.travelRequestId, bogotaToday(at));
      await tx.purTravelExpense.updateMany({
        where: { id: expenseId, deletedAt: null },
        data: { deletedAt: at, updatedBy: actor.principal.userId },
      });
      await recordTravel(tx, actor, at, travel, 'expense.remove', 'expense.removed', {
        expense_id: expenseId,
        amount: expense.amount.toFixed(2),
      });
    });
  }

  async legalize(actor: PurActor, id: string, version: number): Promise<void> {
    const at = this.clock.now();
    await this.database.withTenant(actor.principal, async (tx) => {
      const travel = await travelToLegalize(tx, actor, id, bogotaToday(at));
      const expenses = await tx.purTravelExpense.findMany({
        where: { travelRequestId: id, deletedAt: null },
      });
      if (expenses.length === 0) {
        throw recordInvalid('Registre al menos un gasto con su soporte antes de legalizar.');
      }
      await changeTravel(
        tx,
        { id, version, status: 'approved' },
        {
          status: 'legalized',
          legalizedAt: at,
          updatedBy: actor.principal.userId,
        },
      );
      const advance = travel.advanceAmount.toFixed(2);
      const amounts = expenses.map((expense) => expense.amount.toFixed(2));
      await recordTravel(tx, actor, at, travel, 'legalize', 'legalized', {
        status: ['approved', 'legalized'],
        expense_count: expenses.length,
        balance: travelBalance(advance, amounts),
      });
    });
  }
}

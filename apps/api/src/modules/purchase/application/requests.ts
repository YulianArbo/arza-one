import { Inject, Injectable } from '@nestjs/common';
import {
  purchaseTierOf,
  type PurchaseOptions,
  type PurchaseRequest,
  type SavePurchaseRequest,
} from '@arza/contracts';

import type { Prisma, PurRequest } from '../../../generated/prisma/client.js';
import type { Principal } from '../../../platform/access/principal.js';
import { CLOCK, type Clock } from '../../../platform/clock/clock.js';
import { DatabaseService } from '../../../platform/database/database.service.js';
import type { TenantTransaction } from '../../../platform/database/tenant-context.js';
import { idempotencyKeyReused } from '../../../platform/http/idempotency-key.js';
import { versionConflict } from '../../../platform/http/if-match.js';
import {
  activeCostCenters,
  bogotaToday,
  nextBusinessCode,
  purchaseTiersOn,
} from '../../core/index.js';
import { activePurchaseSuppliers } from '../../party/index.js';
import { approvalAmountOf, canApproveTier } from '../domain/purchase-rules.js';
import {
  approvalLevelRequired,
  recordNotFound,
  segregationRequired,
  statusInvalid,
} from './purchase-messages.js';
import {
  assertActiveCostCenter,
  recordPurEvent,
  requireTiers,
  type PurActor,
} from './purchase-support.js';
import { requestViews } from './request-views.js';

// Solicitudes de compra (B33): la persona la elabora y la envía; otra la aprueba o la rechaza. El
// tramo alto lo aprueba solo la Dirección. Quien solicita no aprueba.

const ENTITY = 'pur_request';

/** Quien decide, con lo que su permiso le deja aprobar. */
export interface PurApprover extends PurActor {
  /** Tiene el permiso de aprobar compras del tramo alto. */
  readonly highApproval: boolean;
}

@Injectable()
export class PurchaseRequestsUseCase {
  constructor(
    @Inject(DatabaseService) private readonly database: DatabaseService,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  /** Todas las solicitudes de la empresa (purchase.read). */
  async list(principal: Principal): Promise<PurchaseRequest[]> {
    const today = bogotaToday(this.clock.now());
    return this.database.withTenant(principal, (tx) => requestViews(tx, principal, today, {}));
  }

  /** Las solicitudes de la persona (purchase.request.create, también solo lo propio). */
  async mine(principal: Principal): Promise<PurchaseRequest[]> {
    const today = bogotaToday(this.clock.now());
    return this.database.withTenant(principal, (tx) =>
      requestViews(tx, principal, today, { requesterId: principal.userId }),
    );
  }

  async options(principal: Principal): Promise<PurchaseOptions> {
    const today = bogotaToday(this.clock.now());
    return this.database.withTenant(principal, async (tx) => {
      const [centers, suppliers, tiers] = await Promise.all([
        activeCostCenters(tx),
        activePurchaseSuppliers(tx, today),
        purchaseTiersOn(tx, today),
      ]);
      return { cost_centers: centers, suppliers, tiers };
    });
  }

  async create(actor: PurActor, key: string, input: SavePurchaseRequest): Promise<string> {
    const at = this.clock.now();
    return this.database.withTenant(actor.principal, async (tx) => {
      const prior = await tx.purRequest.findFirst({ where: { requestKey: key } });
      if (prior !== null) return sameRequest(prior, actor, input) ? prior.id : reuseKey();
      await assertActiveCostCenter(tx, input.cost_center_id);
      const request = await tx.purRequest.create({
        data: {
          tenantId: actor.principal.tenantId,
          code: await nextBusinessCode(tx, 'pur.request', at, {
            name: 'Solicitudes de compra',
            prefix: 'SC',
            padding: 4,
          }),
          requesterId: actor.principal.userId,
          costCenterId: input.cost_center_id,
          description: input.description,
          estimatedAmount: input.estimated_amount,
          requestKey: key,
          createdBy: actor.principal.userId,
        },
      });
      await record(tx, actor, at, request, 'create', 'created', {
        estimated_amount: input.estimated_amount,
        cost_center_id: input.cost_center_id,
        status: 'draft',
      });
      return request.id;
    });
  }

  async update(
    actor: PurActor,
    id: string,
    version: number,
    input: SavePurchaseRequest,
  ): Promise<void> {
    const at = this.clock.now();
    await this.database.withTenant(actor.principal, async (tx) => {
      const request = await ownDraft(tx, actor, id);
      await assertActiveCostCenter(tx, input.cost_center_id);
      await change(
        tx,
        { id, version, status: 'draft' },
        {
          costCenterId: input.cost_center_id,
          description: input.description,
          estimatedAmount: input.estimated_amount,
          updatedBy: actor.principal.userId,
        },
      );
      await record(tx, actor, at, request, 'update', 'updated', {
        estimated_amount: [request.estimatedAmount.toFixed(2), input.estimated_amount],
      });
    });
  }

  async submit(actor: PurActor, id: string, version: number): Promise<void> {
    const at = this.clock.now();
    await this.database.withTenant(actor.principal, async (tx) => {
      const request = await ownDraft(tx, actor, id);
      await requireTiers(tx, bogotaToday(at));
      await change(
        tx,
        { id, version, status: 'draft' },
        {
          status: 'in_approval',
          submittedAt: at,
          updatedBy: actor.principal.userId,
        },
      );
      await record(tx, actor, at, request, 'submit', 'submitted', {
        status: ['draft', 'in_approval'],
      });
    });
  }

  async approve(actor: PurApprover, id: string, version: number): Promise<void> {
    const at = this.clock.now();
    await this.database.withTenant(actor.principal, async (tx) => {
      const request = await pendingDecision(tx, actor, id);
      const selected = await tx.purQuote.findFirst({
        where: { requestId: id, selected: true, deletedAt: null },
      });
      const estimated = request.estimatedAmount.toFixed(2);
      const amount = approvalAmountOf(estimated, selected?.amount.toFixed(2) ?? null);
      const tier = purchaseTierOf(amount, await requireTiers(tx, bogotaToday(at)));
      if (!canApproveTier(tier, actor.highApproval)) throw approvalLevelRequired();
      const status = selected === null ? 'approved' : 'quoted';
      await change(
        tx,
        { id, version, status: 'in_approval' },
        {
          status,
          approvedAmount: amount,
          decidedBy: actor.principal.userId,
          decidedAt: at,
          decisionNote: null,
        },
      );
      await record(tx, actor, at, request, 'approve', 'approved', {
        status: ['in_approval', status],
        approved_amount: amount,
        tier,
      });
    });
  }

  async reject(actor: PurActor, id: string, version: number, reason: string): Promise<void> {
    const at = this.clock.now();
    await this.database.withTenant(actor.principal, async (tx) => {
      const request = await pendingDecision(tx, actor, id);
      await change(
        tx,
        { id, version, status: 'in_approval' },
        {
          status: 'rejected',
          decidedBy: actor.principal.userId,
          decidedAt: at,
          decisionNote: reason,
        },
      );
      await record(tx, actor, at, request, 'reject', 'rejected', {
        status: ['in_approval', 'rejected'],
        reason,
      });
    });
  }
}

function reuseKey(): never {
  throw idempotencyKeyReused();
}

function sameRequest(prior: PurRequest, actor: PurActor, input: SavePurchaseRequest): boolean {
  return (
    prior.requesterId === actor.principal.userId &&
    prior.costCenterId === input.cost_center_id &&
    prior.description === input.description
  );
}

export async function findRequest(tx: TenantTransaction, id: string): Promise<PurRequest> {
  const request = await tx.purRequest.findFirst({ where: { id, deletedAt: null } });
  if (request === null) throw recordNotFound('esa solicitud de compra');
  return request;
}

/** La solicitud en borrador de quien actúa: solo su autor la edita y la envía. */
async function ownDraft(tx: TenantTransaction, actor: PurActor, id: string): Promise<PurRequest> {
  const request = await findRequest(tx, id);
  if (request.requesterId !== actor.principal.userId) {
    throw recordNotFound('esa solicitud de compra');
  }
  if (request.status !== 'draft') {
    throw statusInvalid('La solicitud ya se envió a aprobación y no se edita.');
  }
  return request;
}

/** La solicitud en aprobación, que decide una persona distinta de quien la pidió. */
async function pendingDecision(
  tx: TenantTransaction,
  actor: PurActor,
  id: string,
): Promise<PurRequest> {
  const request = await findRequest(tx, id);
  if (request.status !== 'in_approval') {
    throw statusInvalid('Esa solicitud no está en aprobación.');
  }
  if (request.requesterId === actor.principal.userId) {
    throw segregationRequired('La solicitud la aprueba una persona distinta de quien la pidió.');
  }
  return request;
}

/** Cambia la solicitud si sigue en la versión y el estado que la persona vio. */
export async function change(
  tx: TenantTransaction,
  seen: { readonly id: string; readonly version: number; readonly status: string },
  data: Prisma.PurRequestUncheckedUpdateManyInput,
): Promise<void> {
  const { count } = await tx.purRequest.updateMany({
    where: { ...seen, deletedAt: null },
    data,
  });
  if (count === 0) throw versionConflict();
}

async function record(
  tx: TenantTransaction,
  actor: PurActor,
  at: Date,
  request: PurRequest,
  action: string,
  event: string,
  changes: Prisma.InputJsonObject,
): Promise<void> {
  await recordPurEvent(tx, actor, at, {
    action: `purchase.request.${action}`,
    event: `pur.request.${event}`,
    entityType: ENTITY,
    entityId: request.id,
    payload: { code: request.code },
    changes,
  });
}

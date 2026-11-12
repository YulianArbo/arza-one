import { Inject, Injectable } from '@nestjs/common';
import {
  PURCHASE_ORDER_STATUS,
  type PurchaseOrder,
  type PurchaseReceipt,
  type RegisterReceipt,
} from '@arza/contracts';

import type { Prisma, PurOrder, PurReceipt, PurRequest } from '../../../generated/prisma/client.js';
import type { Principal } from '../../../platform/access/principal.js';
import { CLOCK, type Clock } from '../../../platform/clock/clock.js';
import { DatabaseService } from '../../../platform/database/database.service.js';
import type { TenantTransaction } from '../../../platform/database/tenant-context.js';
import { idempotencyKeyReused } from '../../../platform/http/idempotency-key.js';
import { versionConflict } from '../../../platform/http/if-match.js';
import { bogotaToday, nextBusinessCode, toCalendarDate } from '../../core/index.js';
import { peopleById } from '../../iam/index.js';
import { purchaseSupplierRefs } from '../../party/index.js';
import { receiptDateProblem } from '../domain/purchase-rules.js';
import {
  recordInvalid,
  recordNotFound,
  segregationRequired,
  statusInvalid,
  supplierNotVerified,
} from './purchase-messages.js';
import {
  dateColumn,
  personRef,
  recordPurEvent,
  type PersonRefs,
  type PurActor,
} from './purchase-support.js';
import { change, findRequest } from './requests.js';

// Órdenes de compra y recepciones (B33): la orden se emite al proveedor de la cotización elegida,
// solo si tiene conocimiento del tercero vigente. La recibe una persona distinta de quien pidió la
// compra. Una recepción no conforme queda como novedad y la orden sigue abierta.

const ENTITY = 'pur_order';

@Injectable()
export class PurchaseOrdersUseCase {
  constructor(
    @Inject(DatabaseService) private readonly database: DatabaseService,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  async list(principal: Principal): Promise<PurchaseOrder[]> {
    const today = bogotaToday(this.clock.now());
    return this.database.withTenant(principal, (tx) => orderViews(tx, principal, today));
  }

  /** Emite la orden de una solicitud cotizada; `version` es la de la solicitud. */
  async issue(actor: PurActor, requestId: string, version: number): Promise<string> {
    const at = this.clock.now();
    return this.database.withTenant(actor.principal, async (tx) => {
      const request = await findRequest(tx, requestId);
      if (request.status !== 'quoted') {
        throw statusInvalid('La orden se emite cuando la solicitud tiene una cotización elegida.');
      }
      const quote = await selectedQuote(tx, requestId, bogotaToday(at));
      await change(
        tx,
        { id: requestId, version, status: 'quoted' },
        { status: 'ordered', updatedBy: actor.principal.userId },
      );
      const order = await tx.purOrder.create({
        data: {
          tenantId: actor.principal.tenantId,
          code: await nextBusinessCode(tx, 'pur.order', at, {
            name: 'Órdenes de compra',
            prefix: 'OC',
            padding: 4,
          }),
          requestId,
          supplierId: quote.supplierId,
          total: quote.amount,
          issuedBy: actor.principal.userId,
          issuedAt: at,
          createdBy: actor.principal.userId,
        },
      });
      await record(tx, actor, at, order, 'issue', 'issued', {
        request_id: requestId,
        supplier_id: quote.supplierId,
        total: quote.amount.toFixed(2),
        status: 'issued',
      });
      return order.id;
    });
  }

  async receive(
    actor: PurActor,
    orderId: string,
    key: string,
    input: RegisterReceipt,
  ): Promise<string> {
    const at = this.clock.now();
    return this.database.withTenant(actor.principal, async (tx) => {
      const prior = await tx.purReceipt.findFirst({ where: { requestKey: key } });
      if (prior !== null) return sameReceipt(prior, orderId, input) ? prior.id : reuseKey();
      const order = await findOrder(tx, orderId);
      const request = await findRequest(tx, order.requestId);
      assertReceivable(order, request, actor, input, bogotaToday(at));
      const receipt = await tx.purReceipt.create({
        data: {
          tenantId: actor.principal.tenantId,
          orderId,
          receivedOn: dateColumn(input.received_on),
          receivedBy: actor.principal.userId,
          conforming: input.conforming,
          note: input.note,
          requestKey: key,
          createdBy: actor.principal.userId,
        },
      });
      if (input.conforming) await markReceived(tx, actor, order, request);
      await record(tx, actor, at, order, 'receive', 'received', {
        receipt_id: receipt.id,
        received_on: input.received_on,
        conforming: input.conforming,
        status: ['issued', input.conforming ? 'received' : 'issued'],
      });
      return receipt.id;
    });
  }

  async close(actor: PurActor, orderId: string, version: number): Promise<void> {
    const at = this.clock.now();
    await this.database.withTenant(actor.principal, async (tx) => {
      const order = await findOrder(tx, orderId);
      if (order.status !== 'received') {
        throw statusInvalid('La orden se cierra después de recibirla conforme.');
      }
      const { count } = await tx.purOrder.updateMany({
        where: { id: orderId, version, status: 'received', deletedAt: null },
        data: { status: 'closed', closedAt: at, updatedBy: actor.principal.userId },
      });
      if (count === 0) throw versionConflict();
      await tx.purRequest.updateMany({
        where: { id: order.requestId, status: 'received' },
        data: { status: 'closed', updatedBy: actor.principal.userId },
      });
      await record(tx, actor, at, order, 'close', 'closed', { status: ['received', 'closed'] });
    });
  }
}

function reuseKey(): never {
  throw idempotencyKeyReused();
}

function sameReceipt(prior: PurReceipt, orderId: string, input: RegisterReceipt): boolean {
  return (
    prior.orderId === orderId &&
    prior.conforming === input.conforming &&
    toCalendarDate(prior.receivedOn) === input.received_on
  );
}

async function findOrder(tx: TenantTransaction, id: string): Promise<PurOrder> {
  const order = await tx.purOrder.findFirst({ where: { id, deletedAt: null } });
  if (order === null) throw recordNotFound('esa orden de compra');
  return order;
}

/** La cotización elegida, cuyo proveedor debe tener conocimiento del tercero vigente. */
async function selectedQuote(tx: TenantTransaction, requestId: string, today: string) {
  const quote = await tx.purQuote.findFirst({
    where: { requestId, selected: true, deletedAt: null },
  });
  if (quote === null) throw statusInvalid('Elija una cotización antes de emitir la orden.');
  const supplier = (await purchaseSupplierRefs(tx, today, [quote.supplierId])).get(
    quote.supplierId,
  );
  if (supplier?.verified !== true) throw supplierNotVerified();
  return quote;
}

function assertReceivable(
  order: PurOrder,
  request: PurRequest,
  actor: PurActor,
  input: RegisterReceipt,
  today: string,
): void {
  if (order.status !== 'issued') throw statusInvalid('Esa orden ya se recibió conforme.');
  if (request.requesterId === actor.principal.userId) {
    throw segregationRequired('La compra la recibe una persona distinta de quien la pidió.');
  }
  const issuedOn = bogotaToday(order.issuedAt);
  const problem = receiptDateProblem(input.received_on, issuedOn, today);
  if (problem === 'future') {
    throw recordInvalid('La fecha de recepción no puede ser posterior a hoy.');
  }
  if (problem === 'before_order') {
    throw recordInvalid('La fecha de recepción no puede ser anterior a la orden.');
  }
}

async function markReceived(
  tx: TenantTransaction,
  actor: PurActor,
  order: PurOrder,
  request: PurRequest,
): Promise<void> {
  const { count } = await tx.purOrder.updateMany({
    where: { id: order.id, status: 'issued', deletedAt: null },
    data: { status: 'received', updatedBy: actor.principal.userId },
  });
  if (count === 0) throw versionConflict();
  await tx.purRequest.updateMany({
    where: { id: request.id, status: 'ordered' },
    data: { status: 'received', updatedBy: actor.principal.userId },
  });
}

async function record(
  tx: TenantTransaction,
  actor: PurActor,
  at: Date,
  order: PurOrder,
  action: string,
  event: string,
  changes: Prisma.InputJsonObject,
): Promise<void> {
  await recordPurEvent(tx, actor, at, {
    action: `purchase.order.${action}`,
    event: `pur.order.${event}`,
    entityType: ENTITY,
    entityId: order.id,
    payload: { code: order.code },
    changes,
  });
}

async function orderViews(
  tx: TenantTransaction,
  principal: Principal,
  today: string,
): Promise<PurchaseOrder[]> {
  const orders = await tx.purOrder.findMany({
    where: { deletedAt: null },
    orderBy: { code: 'desc' },
    take: 300,
    include: { request: true, receipts: { orderBy: { createdAt: 'asc' } } },
  });
  const [suppliers, people] = await Promise.all([
    purchaseSupplierRefs(
      tx,
      today,
      orders.map((order) => order.supplierId),
    ),
    peopleById(
      tx,
      orders.flatMap((order) => order.receipts.map((receipt) => receipt.receivedBy)),
    ),
  ]);
  return orders.map((order) => orderView(order, { suppliers, people }, principal));
}

type OrderRow = PurOrder & {
  readonly request: PurRequest;
  readonly receipts: readonly PurReceipt[];
};

interface OrderRefs {
  readonly suppliers: Awaited<ReturnType<typeof purchaseSupplierRefs>>;
  readonly people: PersonRefs;
}

function orderView(order: OrderRow, refs: OrderRefs, principal: Principal): PurchaseOrder {
  const { suppliers, people } = refs;
  return {
    id: order.id,
    code: order.code,
    request: {
      id: order.request.id,
      code: order.request.code,
      description: order.request.description,
    },
    supplier: {
      id: order.supplierId,
      name: suppliers.get(order.supplierId)?.name ?? 'Proveedor',
    },
    total: order.total.toFixed(2),
    status: PURCHASE_ORDER_STATUS.find((status) => status === order.status) ?? 'issued',
    issued_at: order.issuedAt.toISOString(),
    requested_by_me: order.request.requesterId === principal.userId,
    receipts: order.receipts.map((receipt) => receiptView(receipt, people)),
    version: order.version,
  };
}

function receiptView(receipt: PurReceipt, people: PersonRefs): PurchaseReceipt {
  return {
    id: receipt.id,
    received_on: toCalendarDate(receipt.receivedOn),
    received_by: personRef(people, receipt.receivedBy),
    conforming: receipt.conforming,
    note: receipt.note,
  };
}

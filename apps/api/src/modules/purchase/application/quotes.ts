import { Inject, Injectable } from '@nestjs/common';
import type { AddPurchaseQuote } from '@arza/contracts';

import type { Prisma, PurQuote, PurRequest } from '../../../generated/prisma/client.js';
import { CLOCK, type Clock } from '../../../platform/clock/clock.js';
import { DatabaseService } from '../../../platform/database/database.service.js';
import type { TenantTransaction } from '../../../platform/database/tenant-context.js';
import { bogotaToday } from '../../core/index.js';
import { activePurchaseSuppliers } from '../../party/index.js';
import { quoteSelectionOutcome } from '../domain/purchase-rules.js';
import {
  quotesMissing,
  recordInvalid,
  recordNotFound,
  statusInvalid,
} from './purchase-messages.js';
import { assertOwnFile, recordPurEvent, requireTiers, type PurActor } from './purchase-support.js';
import { change, findRequest } from './requests.js';

// Cotizaciones y cuadro comparativo (B33): se cargan sobre una solicitud aprobada y se elige una.
// Elegir exige las cotizaciones mínimas del tramo; si la elegida sube de tramo, la solicitud vuelve
// a aprobación (decisión 5).

const ENTITY = 'pur_quote';
const OPEN_FOR_QUOTES = ['approved', 'quoted'];

@Injectable()
export class PurchaseQuotesUseCase {
  constructor(
    @Inject(DatabaseService) private readonly database: DatabaseService,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  async add(actor: PurActor, requestId: string, input: AddPurchaseQuote): Promise<string> {
    const at = this.clock.now();
    return this.database.withTenant(actor.principal, async (tx) => {
      const request = await quotableRequest(tx, requestId);
      await validateQuote(tx, actor, requestId, input, bogotaToday(at));
      const quote = await tx.purQuote.create({
        data: {
          tenantId: actor.principal.tenantId,
          requestId,
          supplierId: input.supplier_id,
          amount: input.amount,
          deliveryDays: input.delivery_days,
          fileId: input.file_id,
          createdBy: actor.principal.userId,
        },
      });
      await record(tx, actor, at, quote, request, 'add', 'added', {
        supplier_id: input.supplier_id,
        amount: input.amount,
        delivery_days: input.delivery_days,
      });
      return quote.id;
    });
  }

  async remove(actor: PurActor, quoteId: string): Promise<void> {
    const at = this.clock.now();
    await this.database.withTenant(actor.principal, async (tx) => {
      const quote = await findQuote(tx, quoteId);
      const request = await quotableRequest(tx, quote.requestId);
      if (quote.selected) {
        throw statusInvalid('La cotización elegida no se quita. Elija otra primero.');
      }
      await tx.purQuote.updateMany({
        where: { id: quoteId, deletedAt: null },
        data: { deletedAt: at, updatedBy: actor.principal.userId },
      });
      await record(tx, actor, at, quote, request, 'remove', 'removed', {
        supplier_id: quote.supplierId,
        amount: quote.amount.toFixed(2),
      });
    });
  }

  /** Elige la cotización ganadora; `version` es la de la solicitud que la persona vio. */
  async select(actor: PurActor, quoteId: string, version: number): Promise<void> {
    const at = this.clock.now();
    await this.database.withTenant(actor.principal, async (tx) => {
      const quote = await findQuote(tx, quoteId);
      const request = await quotableRequest(tx, quote.requestId);
      const status = await statusAfterSelection(tx, request, quote, bogotaToday(at));
      await tx.purQuote.updateMany({
        where: { requestId: request.id, selected: true, deletedAt: null },
        data: { selected: false },
      });
      await tx.purQuote.updateMany({ where: { id: quoteId }, data: { selected: true } });
      await change(
        tx,
        { id: request.id, version, status: request.status },
        { status, updatedBy: actor.principal.userId },
      );
      await record(tx, actor, at, quote, request, 'select', 'selected', {
        supplier_id: quote.supplierId,
        amount: quote.amount.toFixed(2),
        status: [request.status, status],
      });
    });
  }
}

async function findQuote(tx: TenantTransaction, id: string): Promise<PurQuote> {
  const quote = await tx.purQuote.findFirst({ where: { id, deletedAt: null } });
  if (quote === null) throw recordNotFound('esa cotización');
  return quote;
}

/** La solicitud admite cotizaciones mientras está aprobada o cotizada y aún no tiene orden. */
async function quotableRequest(tx: TenantTransaction, id: string): Promise<PurRequest> {
  const request = await findRequest(tx, id);
  if (!OPEN_FOR_QUOTES.includes(request.status)) {
    throw statusInvalid(
      'Las cotizaciones se gestionan con la solicitud aprobada y antes de emitir la orden.',
    );
  }
  return request;
}

async function validateQuote(
  tx: TenantTransaction,
  actor: PurActor,
  requestId: string,
  input: AddPurchaseQuote,
  today: string,
): Promise<void> {
  const suppliers = await activePurchaseSuppliers(tx, today);
  if (!suppliers.some((supplier) => supplier.id === input.supplier_id)) {
    throw recordInvalid('Elija un proveedor vigente.');
  }
  const repeated = await tx.purQuote.count({
    where: { requestId, supplierId: input.supplier_id, deletedAt: null },
  });
  if (repeated > 0) throw recordInvalid('Ese proveedor ya tiene una cotización en esta solicitud.');
  await assertOwnFile(tx, actor, input.file_id);
}

async function statusAfterSelection(
  tx: TenantTransaction,
  request: PurRequest,
  quote: PurQuote,
  today: string,
): Promise<'quoted' | 'in_approval'> {
  const quoteCount = await tx.purQuote.count({
    where: { requestId: request.id, deletedAt: null },
  });
  const outcome = quoteSelectionOutcome({
    approvedAmount: (request.approvedAmount ?? request.estimatedAmount).toFixed(2),
    quoteAmount: quote.amount.toFixed(2),
    quoteCount,
    tiers: await requireTiers(tx, today),
  });
  if (outcome.kind === 'quotes_missing') throw quotesMissing(outcome.required, quoteCount);
  return outcome.kind === 'quoted' ? 'quoted' : 'in_approval';
}

async function record(
  tx: TenantTransaction,
  actor: PurActor,
  at: Date,
  quote: PurQuote,
  request: PurRequest,
  action: string,
  event: string,
  changes: Prisma.InputJsonObject,
): Promise<void> {
  await recordPurEvent(tx, actor, at, {
    action: `purchase.quote.${action}`,
    event: `pur.quote.${event}`,
    entityType: ENTITY,
    entityId: quote.id,
    payload: { request_id: request.id, request_code: request.code },
    changes,
  });
}

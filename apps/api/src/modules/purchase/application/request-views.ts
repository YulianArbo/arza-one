import {
  PURCHASE_ORDER_STATUS,
  PURCHASE_REQUEST_STATUS,
  minQuotesOf,
  purchaseTierOf,
  type PurchaseQuote,
  type PurchaseRequest,
  type PurchaseTiers,
} from '@arza/contracts';

import type { Prisma, PurOrder, PurQuote, PurRequest } from '../../../generated/prisma/client.js';
import type { Principal } from '../../../platform/access/principal.js';
import type { TenantTransaction } from '../../../platform/database/tenant-context.js';
import { costCenterRefs, purchaseTiersOn } from '../../core/index.js';
import { peopleById } from '../../iam/index.js';
import { purchaseSupplierRefs, type PurchaseSupplier } from '../../party/index.js';
import { approvalAmountOf } from '../domain/purchase-rules.js';
import { centerRef, personRef, type PersonRefs } from './purchase-support.js';

// Cómo se ve una solicitud de compra: con sus cotizaciones (el cuadro comparativo), el tramo del
// valor que manda y su orden, si ya la tiene.

interface RequestRefs {
  readonly quotes: readonly PurQuote[];
  readonly orders: readonly PurOrder[];
  readonly centers: Awaited<ReturnType<typeof costCenterRefs>>;
  readonly people: PersonRefs;
  readonly suppliers: ReadonlyMap<string, PurchaseSupplier>;
  readonly tiers: PurchaseTiers | null;
}

export async function requestViews(
  tx: TenantTransaction,
  principal: Principal,
  today: string,
  where: Prisma.PurRequestWhereInput,
): Promise<PurchaseRequest[]> {
  const requests = await tx.purRequest.findMany({
    where: { ...where, deletedAt: null },
    orderBy: { code: 'desc' },
    take: 300,
  });
  const refs = await loadRefs(tx, today, requests);
  return requests.map((request) => requestView(request, refs, principal));
}

async function loadRefs(
  tx: TenantTransaction,
  today: string,
  requests: readonly PurRequest[],
): Promise<RequestRefs> {
  const ids = requests.map((request) => request.id);
  const [quotes, orders, centers, people, tiers] = await Promise.all([
    tx.purQuote.findMany({
      where: { requestId: { in: ids }, deletedAt: null },
      orderBy: { amount: 'asc' },
    }),
    tx.purOrder.findMany({ where: { requestId: { in: ids }, deletedAt: null } }),
    costCenterRefs(
      tx,
      requests.map((request) => request.costCenterId),
    ),
    peopleById(
      tx,
      requests.map((request) => request.requesterId),
    ),
    purchaseTiersOn(tx, today),
  ]);
  const suppliers = await purchaseSupplierRefs(
    tx,
    today,
    quotes.map((quote) => quote.supplierId),
  );
  return { quotes, orders, centers, people, suppliers, tiers };
}

function quoteView(quote: PurQuote, refs: RequestRefs): PurchaseQuote {
  const supplier = refs.suppliers.get(quote.supplierId);
  return {
    id: quote.id,
    supplier: supplier ?? { id: quote.supplierId, name: 'Proveedor', verified: false },
    amount: quote.amount.toFixed(2),
    delivery_days: quote.deliveryDays,
    file_id: quote.fileId,
    selected: quote.selected,
  };
}

function orderRef(request: PurRequest, refs: RequestRefs): PurchaseRequest['order'] {
  const order = refs.orders.find((item) => item.requestId === request.id);
  if (order === undefined) return null;
  return {
    id: order.id,
    code: order.code,
    status: PURCHASE_ORDER_STATUS.find((status) => status === order.status) ?? 'issued',
  };
}

function requestView(
  request: PurRequest,
  refs: RequestRefs,
  principal: Principal,
): PurchaseRequest {
  const quotes = refs.quotes.filter((quote) => quote.requestId === request.id);
  const selected = quotes.find((quote) => quote.selected);
  const estimated = request.estimatedAmount.toFixed(2);
  const amount = approvalAmountOf(estimated, selected?.amount.toFixed(2) ?? null);
  const tier = refs.tiers === null ? null : purchaseTierOf(amount, refs.tiers);
  return {
    id: request.id,
    code: request.code,
    description: request.description,
    estimated_amount: estimated,
    approval_amount: amount,
    tier,
    min_quotes: refs.tiers === null || tier === null ? null : minQuotesOf(tier, refs.tiers),
    cost_center: centerRef(refs.centers, request.costCenterId),
    requester: personRef(refs.people, request.requesterId),
    status: PURCHASE_REQUEST_STATUS.find((status) => status === request.status) ?? 'draft',
    decision_note: request.decisionNote,
    mine: request.requesterId === principal.userId,
    quotes: quotes.map((quote) => quoteView(quote, refs)),
    order: orderRef(request, refs),
    version: request.version,
  };
}

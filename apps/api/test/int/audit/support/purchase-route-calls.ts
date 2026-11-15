import { signedCopy } from './contract-steps.js';
import type { RouteCall } from './project-route-calls.js';
import { createdId, keyed, putVersioned, versioned } from '../../fin/support/ledger-steps.js';
import type { AccessScenario } from '../../iam/support/access-scenario.js';
import {
  EVALUATIONS,
  ORDERS,
  QUOTES,
  REQUESTS,
  TRAVEL,
  addQuote,
  approvedRequest,
  approvedTravel,
  del,
  draftRequest,
  issuedOrder,
  purchaseTeam,
  quotedRequest,
  receiptBody,
  requestBody,
  submittedRequest,
  supplier,
  travelBody,
  travelExpense,
  type PurchaseTeam,
} from '../../purchase/support/purchase-steps.js';

// Llamadas del recorrido de escrituras (B11) para Compras, proveedores y viajes (B33). Cada una
// prepara por la API lo que necesita; la llamada final es la que se revisa. Datos ficticios.

let label = 0;

function team(s: AccessScenario): Promise<PurchaseTeam> {
  label += 1;
  return purchaseTeam(s, `b33-recorrido-${String(label)}`);
}

const REASON = { reason: 'Rechazo del recorrido de auditoría' };

const REQUEST_CALLS: Record<string, RouteCall> = {
  'POST /v1/purchase-requests': async (s) => {
    const t = await team(s);
    return { test: keyed(s, t.requester, REQUESTS, requestBody(t, '100000.00')) };
  },
  'PUT /v1/purchase-requests/{id}': async (s) => {
    const t = await team(s);
    const id = await draftRequest(s, t, '100000.00');
    const body = requestBody(t, '120000.00');
    return { test: putVersioned(s, `${REQUESTS}/${id}`, t.requester, body, 1) };
  },
  'POST /v1/purchase-requests/{id}/submission': async (s) => {
    const t = await team(s);
    const id = await draftRequest(s, t, '100000.00');
    return { test: versioned(s.post(`${REQUESTS}/${id}/submission`, t.requester.session), 1) };
  },
  'POST /v1/purchase-requests/{id}/approval': async (s) => {
    const t = await team(s);
    const id = await submittedRequest(s, t, '100000.00');
    return { test: versioned(s.post(`${REQUESTS}/${id}/approval`, t.approver.session), 2) };
  },
  'POST /v1/purchase-requests/{id}/rejection': async (s) => {
    const t = await team(s);
    const id = await submittedRequest(s, t, '100000.00');
    const call = s.post(`${REQUESTS}/${id}/rejection`, t.approver.session, REASON);
    return { test: versioned(call, 2) };
  },
  'POST /v1/purchase-requests/{id}/quotes': async (s) => {
    const t = await team(s);
    const id = await approvedRequest(s, t, '100000.00');
    const body = {
      supplier_id: await supplier(s, t),
      amount: '95000.00',
      delivery_days: 2,
      file_id: await signedCopy(s, t.buyer),
    };
    return { test: s.post(`${REQUESTS}/${id}/quotes`, t.buyer.session, body) };
  },
  'DELETE /v1/purchase-quotes/{id}': async (s) => {
    const t = await team(s);
    const id = await approvedRequest(s, t, '100000.00');
    const quote = { supplierId: await supplier(s, t), amount: '95000.00' };
    return { test: del(s, `${QUOTES}/${await addQuote(s, t, id, quote)}`, t.buyer) };
  },
  'POST /v1/purchase-quotes/{id}/selection': async (s) => {
    const t = await team(s);
    const id = await approvedRequest(s, t, '100000.00');
    const quote = await addQuote(s, t, id, {
      supplierId: await supplier(s, t),
      amount: '95000.00',
    });
    return { test: versioned(s.post(`${QUOTES}/${quote}/selection`, t.buyer.session), 3) };
  },
};

const ORDER_CALLS: Record<string, RouteCall> = {
  'POST /v1/purchase-requests/{id}/order': async (s) => {
    const t = await team(s);
    const { id } = await quotedRequest(s, t);
    return { test: versioned(s.post(`${REQUESTS}/${id}/order`, t.buyer.session), 4) };
  },
  'POST /v1/purchase-orders/{id}/receipts': async (s) => {
    const t = await team(s);
    const id = await issuedOrder(s, t);
    return { test: keyed(s, t.buyer, `${ORDERS}/${id}/receipts`, receiptBody(s, true)) };
  },
  'POST /v1/purchase-orders/{id}/closure': async (s) => {
    const t = await team(s);
    const id = await issuedOrder(s, t);
    await createdId(keyed(s, t.buyer, `${ORDERS}/${id}/receipts`, receiptBody(s, true)));
    return { test: versioned(s.post(`${ORDERS}/${id}/closure`, t.buyer.session), 2) };
  },
  'POST /v1/supplier-evaluations': async (s) => {
    const t = await team(s);
    const body = {
      supplier_id: await supplier(s, t),
      kind: 'selection',
      period: '2026',
      criteria: { quality: 4, compliance: 4, price: 4, service: 4 },
      note: 'Evaluación del recorrido de auditoría',
    };
    return { test: s.post(EVALUATIONS, t.buyer.session, body) };
  },
};

const TRAVEL_CALLS: Record<string, RouteCall> = {
  'POST /v1/travel-requests': async (s) => {
    const t = await team(s);
    return { test: keyed(s, t.requester, TRAVEL, travelBody(s, 5)) };
  },
  'PUT /v1/travel-requests/{id}': async (s) => {
    const t = await team(s);
    const id = await createdId(keyed(s, t.requester, TRAVEL, travelBody(s, 5)));
    return { test: putVersioned(s, `${TRAVEL}/${id}`, t.requester, travelBody(s, 6), 1) };
  },
  'POST /v1/travel-requests/{id}/submission': async (s) => {
    const t = await team(s);
    const id = await createdId(keyed(s, t.requester, TRAVEL, travelBody(s, 5)));
    return { test: versioned(s.post(`${TRAVEL}/${id}/submission`, t.requester.session), 1) };
  },
  'POST /v1/travel-requests/{id}/approval': async (s) => {
    const t = await team(s);
    const id = await createdId(keyed(s, t.requester, TRAVEL, travelBody(s, 5)));
    await versioned(s.post(`${TRAVEL}/${id}/submission`, t.requester.session), 1).expect(204);
    return { test: versioned(s.post(`${TRAVEL}/${id}/approval`, t.approver.session), 2) };
  },
  'POST /v1/travel-requests/{id}/rejection': async (s) => {
    const t = await team(s);
    const id = await createdId(keyed(s, t.requester, TRAVEL, travelBody(s, 5)));
    await versioned(s.post(`${TRAVEL}/${id}/submission`, t.requester.session), 1).expect(204);
    const call = s.post(`${TRAVEL}/${id}/rejection`, t.approver.session, REASON);
    return { test: versioned(call, 2) };
  },
  'POST /v1/travel-requests/{id}/expenses': async (s) => {
    const t = await team(s);
    const id = await approvedTravel(s, t);
    const body = {
      concept: 'Transporte ficticio del recorrido',
      amount: '45000.00',
      support_file_id: await signedCopy(s, t.requester),
    };
    return { test: keyed(s, t.requester, `${TRAVEL}/${id}/expenses`, body) };
  },
  'DELETE /v1/travel-expenses/{id}': async (s) => {
    const t = await team(s);
    const id = await approvedTravel(s, t);
    const expense = await travelExpense(s, t, id, '45000.00');
    return { test: del(s, `/v1/travel-expenses/${expense}`, t.requester) };
  },
  'POST /v1/travel-requests/{id}/legalization': async (s) => {
    const t = await team(s);
    const id = await approvedTravel(s, t);
    await travelExpense(s, t, id, '45000.00');
    return { test: versioned(s.post(`${TRAVEL}/${id}/legalization`, t.requester.session), 3) };
  },
};

export const PURCHASE_ROUTE_CALLS: Record<string, RouteCall> = {
  ...REQUEST_CALLS,
  ...ORDER_CALLS,
  ...TRAVEL_CALLS,
};

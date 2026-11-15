import {
  purchaseOrderListResponseSchema,
  purchaseRequestListResponseSchema,
  type PurchaseOrder,
  type PurchaseRequest,
} from '@arza/contracts';
import request from 'supertest';
import { expect } from 'vitest';

import { day, signedCopy } from '../../audit/support/contract-steps.js';
import { createdId, keyed, ledgerBasics, versioned } from '../../fin/support/ledger-steps.js';
import type { AccessScenario, Person } from '../../iam/support/access-scenario.js';
import { WEB_ORIGIN, freshIp } from '../../iam/support/iam-fixtures.js';
import { organizationBody } from '../../party/support/party-scenario.js';

// Pasos comunes de las pruebas del B33 (compras, proveedores y viajes). Los topes sembrados son:
// hasta $ 1.000.000, una cotización; hasta $ 10.000.000, dos; por encima, tres y la Dirección.
// Datos ficticios.

export const REQUESTS = '/v1/purchase-requests';
export const ORDERS = '/v1/purchase-orders';
export const QUOTES = '/v1/purchase-quotes';
export const EVALUATIONS = '/v1/supplier-evaluations';
export const TRAVEL = '/v1/travel-requests';

export interface PurchaseTeam {
  /** Colaborador que pide compras y viajes: solo lo propio. */
  readonly requester: Person;
  /** Administrativo y financiero que cotiza, ordena y recibe. */
  readonly buyer: Person;
  /** Otra persona de Administrativo y financiero, para aprobar. */
  readonly approver: Person;
  readonly director: Person;
  readonly costCenterId: string;
}

export async function purchaseTeam(s: AccessScenario, label: string): Promise<PurchaseTeam> {
  const { costCenterId } = await ledgerBasics(s);
  return {
    requester: await s.person(`solicitante-${label}`, ['COLABORADOR']),
    buyer: await s.person(`compras-${label}`, ['ADMIN_FINANCIERO']),
    approver: await s.person(`aprobador-${label}`, ['ADMIN_FINANCIERO']),
    director: await s.person(`direccion-${label}`, ['DIRECCION']),
    costCenterId,
  };
}

export function del(s: AccessScenario, path: string, person: Person): request.Test {
  return request(s.app.getHttpServer())
    .delete(path)
    .set('Origin', WEB_ORIGIN)
    .set('X-Forwarded-For', freshIp())
    .set('Cookie', person.session.cookie)
    .set('X-CSRF-Token', person.session.session.csrf_token);
}

/** Proveedor ficticio; con `verified`, con su conocimiento del tercero aprobado y vigente. */
export async function supplier(
  s: AccessScenario,
  t: PurchaseTeam,
  verified = true,
): Promise<string> {
  const body = organizationBody({ roles: ['supplier'] });
  const id = await createdId(s.post('/v1/parties', t.buyer.session, body));
  if (!verified) return id;
  await s.inTenant((tx) =>
    tx.dueDiligence.create({
      data: {
        tenantId: s.tenant.id,
        partyId: id,
        riskLevel: 'low',
        summary: 'Revisión ficticia del proveedor de prueba.',
        status: 'approved',
        reviewedBy: t.director.id,
        reviewedAt: new Date(),
        nextReviewOn: new Date(`${day(s, 365)}T00:00:00.000Z`),
      },
    }),
  );
  return id;
}

export function requestBody(t: PurchaseTeam, amount: string): object {
  return {
    cost_center_id: t.costCenterId,
    description: 'Compra ficticia de equipos de prueba',
    estimated_amount: amount,
  };
}

/** Solicitud en borrador (versión 1). */
export async function draftRequest(
  s: AccessScenario,
  t: PurchaseTeam,
  amount: string,
  requester: Person = t.requester,
): Promise<string> {
  return createdId(keyed(s, requester, REQUESTS, requestBody(t, amount)));
}

/** Solicitud enviada a aprobación (versión 2). */
export async function submittedRequest(
  s: AccessScenario,
  t: PurchaseTeam,
  amount: string,
  requester: Person = t.requester,
): Promise<string> {
  const id = await draftRequest(s, t, amount, requester);
  await versioned(s.post(`${REQUESTS}/${id}/submission`, requester.session), 1).expect(204);
  return id;
}

/** Solicitud aprobada (versión 3): la del tramo alto la aprueba la Dirección. */
export async function approvedRequest(
  s: AccessScenario,
  t: PurchaseTeam,
  amount: string,
  requester: Person = t.requester,
): Promise<string> {
  const id = await submittedRequest(s, t, amount, requester);
  const approver = Number(amount) > 10_000_000 ? t.director : t.approver;
  await versioned(s.post(`${REQUESTS}/${id}/approval`, approver.session), 2).expect(204);
  return id;
}

export async function addQuote(
  s: AccessScenario,
  t: PurchaseTeam,
  requestId: string,
  quote: { readonly supplierId: string; readonly amount: string },
): Promise<string> {
  const body = {
    supplier_id: quote.supplierId,
    amount: quote.amount,
    delivery_days: 5,
    file_id: await signedCopy(s, t.buyer),
  };
  return createdId(s.post(`${REQUESTS}/${requestId}/quotes`, t.buyer.session, body));
}

/** Solicitud del tramo bajo con su cotización elegida (versión 4). */
export async function quotedRequest(
  s: AccessScenario,
  t: PurchaseTeam,
  options: { readonly verified?: boolean; readonly requester?: Person } = {},
): Promise<{ id: string; quoteId: string }> {
  const amount = '800000.00';
  const id = await approvedRequest(s, t, amount, options.requester ?? t.requester);
  const supplierId = await supplier(s, t, options.verified ?? true);
  const quoteId = await addQuote(s, t, id, { supplierId, amount });
  await versioned(s.post(`${QUOTES}/${quoteId}/selection`, t.buyer.session), 3).expect(204);
  return { id, quoteId };
}

/** Orden emitida (versión 1) de una solicitud del tramo bajo. */
export async function issuedOrder(
  s: AccessScenario,
  t: PurchaseTeam,
  requester: Person = t.requester,
): Promise<string> {
  const { id } = await quotedRequest(s, t, { requester });
  return createdId(versioned(s.post(`${REQUESTS}/${id}/order`, t.buyer.session), 4));
}

export function receiptBody(s: AccessScenario, conforming: boolean): object {
  return {
    received_on: day(s, 0),
    conforming,
    note: conforming ? null : 'Llegó incompleto en la prueba',
  };
}

export async function requestOf(
  s: AccessScenario,
  person: Person,
  id: string,
): Promise<PurchaseRequest> {
  const response = await s.get(REQUESTS, person.session);
  expect(response.status, response.text).toBe(200);
  const found = purchaseRequestListResponseSchema
    .parse(response.body)
    .data.find((row) => row.id === id);
  if (found === undefined) throw new Error('La solicitud no aparece en la lista');
  return found;
}

export async function orderOf(
  s: AccessScenario,
  person: Person,
  id: string,
): Promise<PurchaseOrder> {
  const response = await s.get(ORDERS, person.session);
  expect(response.status, response.text).toBe(200);
  const found = purchaseOrderListResponseSchema
    .parse(response.body)
    .data.find((row) => row.id === id);
  if (found === undefined) throw new Error('La orden no aparece en la lista');
  return found;
}

export function travelBody(s: AccessScenario, startsIn: number, advance = '500000.00'): object {
  return {
    destination: 'Medellín',
    purpose: 'Visita ficticia de seguimiento a un cliente de prueba',
    starts_on: day(s, startsIn),
    ends_on: day(s, startsIn + 2),
    advance_amount: advance,
  };
}

/** Viaje aprobado (versión 3) del solicitante, que ya empezó si `startsIn` no es futuro. */
export async function approvedTravel(
  s: AccessScenario,
  t: PurchaseTeam,
  startsIn = -3,
): Promise<string> {
  const id = await createdId(keyed(s, t.requester, TRAVEL, travelBody(s, startsIn)));
  await versioned(s.post(`${TRAVEL}/${id}/submission`, t.requester.session), 1).expect(204);
  await versioned(s.post(`${TRAVEL}/${id}/approval`, t.approver.session), 2).expect(204);
  return id;
}

export async function travelExpense(
  s: AccessScenario,
  t: PurchaseTeam,
  travelId: string,
  amount: string,
): Promise<string> {
  const body = {
    concept: 'Hotel ficticio de la prueba',
    amount,
    support_file_id: await signedCopy(s, t.requester),
  };
  return createdId(keyed(s, t.requester, `${TRAVEL}/${travelId}/expenses`, body));
}

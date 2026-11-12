import { invoiceCreatedResponseSchema, pettyCashResponseSchema } from '@arza/contracts';
import type request from 'supertest';
import { expect } from 'vitest';

import { seedCore } from '../../../../src/modules/core/index.js';
import { systemClock } from '../../../../src/platform/clock/clock.js';
import type { AccessScenario, Person } from '../../iam/support/access-scenario.js';
import { apiDatabase } from '../../support/integration-database.js';
import { put, signedCopy } from '../../audit/support/contract-steps.js';

// Pasos comunes de las pruebas del B32 (presupuesto, gastos, caja menor, conciliación, cierre y
// exportación). Datos ficticios.

export const FIN = '/v1/finance';

/** Catálogo de rubros sembrado y un centro de costo activo. */
export async function ledgerBasics(s: AccessScenario): Promise<{ costCenterId: string }> {
  await seedCore(apiDatabase(), [s.tenant.id], systemClock);
  const center = await s.inTenant((tx) =>
    tx.costCenter.create({
      data: {
        tenantId: s.tenant.id,
        code: `CC${crypto.randomUUID().slice(0, 6).toUpperCase()}`,
        name: 'Centro ficticio de desarrollo',
      },
    }),
  );
  return { costCenterId: center.id };
}

export function keyed(s: AccessScenario, person: Person, path: string, body: object): request.Test {
  return s.post(path, person.session, body).set('Idempotency-Key', crypto.randomUUID());
}

export function versioned(test: request.Test, version: number): request.Test {
  return test.set('If-Match', `"${String(version)}"`);
}

export function putVersioned(
  s: AccessScenario,
  path: string,
  person: Person,
  body: object,
  version: number,
): request.Test {
  return versioned(put(s, path, person, body), version);
}

export async function createdId(test: request.Test): Promise<string> {
  const response = await test;
  expect(response.status, response.text).toBe(201);
  return invoiceCreatedResponseSchema.parse(response.body).id;
}

export async function expenseBody(
  s: AccessScenario,
  person: Person,
  costCenterId: string,
  date: string,
  amount = '150000.00',
): Promise<object> {
  return {
    expense_date: date,
    amount,
    category: 'SOFTWARE',
    cost_center_id: costCenterId,
    supplier_id: null,
    description: 'Licencia ficticia de prueba',
    support_file_id: await signedCopy(s, person),
  };
}

export function movementBody(
  type: 'opening' | 'voucher' | 'replenishment',
  amount: string,
  date: string,
  costCenterId: string | null = null,
): object {
  return {
    movement_date: date,
    type,
    amount,
    concept: type === 'voucher' ? 'Taxi a reunión ficticia' : 'Fondo de caja ficticio',
    cost_center_id: type === 'voucher' ? costCenterId : null,
    category: type === 'voucher' ? 'TRANSPORT' : null,
    support_file_id: null,
  };
}

/** Abre la caja menor si aún no está abierta. */
export async function pettyCashOpen(
  s: AccessScenario,
  finance: Person,
  date: string,
): Promise<void> {
  const response = await s.get(`${FIN}/petty-cash`, finance.session);
  expect(response.status, response.text).toBe(200);
  if (pettyCashResponseSchema.parse(response.body).data.fund !== null) return;
  await createdId(
    keyed(s, finance, `${FIN}/petty-cash/movements`, movementBody('opening', '500000.00', date)),
  );
}

/** Un mes AAAA-MM `back` meses antes del de la fecha dada (AAAA-MM-DD). */
export function monthsBefore(date: string, back: number): string {
  const [year, month] = date.split('-').map(Number) as [number, number];
  const moved = new Date(Date.UTC(year, month - 1 - back, 1));
  return `${String(moved.getUTCFullYear())}-${String(moved.getUTCMonth() + 1).padStart(2, '0')}`;
}
